// SERVER-ONLY. Actions on a multi-product ticket (format 2). Product fields live in items[] under the same
// names a single-product ticket uses at the top level, so the workflow panel writes the same fields per product.
import { TICKET_STATUS, PANEL_STATE, TICKET_ITEM_MAX_FILES, TICKET_MAX_ITEMS, itemNumber } from './constants';
import { ticketDesigns, g2dEstimates, itemView, itemStatus, requestedSpecs, canConfirmOrder, multiTicketStatus } from './normalize';
import { claimFiles, historyEntry, getTodayGoldRate, commentEntry } from './server';
import { postUpstream } from '@/lib/reports/serverAccess';

const fail = (error, status = 409) => ({ error, status });

export const TICKET_OPEN = { status: TICKET_STATUS.IN_PROGRESS, status_label: 'In progress', team_label: 'with CAD' };

export function newTicketItem(ticketNumber, seq, specs, images, now) {
  return {
    item_id: itemNumber(ticketNumber, seq),
    item_seq: seq,
    specs,
    requested_specs: specs,
    reference_images: images,
    ...PANEL_STATE.G2D_REQUESTED,
    awaiting_cad_since: now,
    created_at: now,
    history: [],
  };
}

const prefixed = (prefix, fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [`${prefix}.${k}`, v]));

async function verifyAdvanceReceipt(session, ticket, receiptId, amount) {
  let receipt;
  try {
    receipt = (await postUpstream(session, 'Services/POS/Receipt/Retrieve', { EntityId: receiptId }))?.Entity;
  } catch (err) {
    console.error('[ticketing] receipt retrieve', err?.message);
    return { error: fail('Could not verify the advance receipt with OrnaVerse. Please try again.', 502) };
  }
  if (!receipt || !receipt.is_advance || receipt.party_id !== ticket.customer_party_id
    || Math.abs((receipt.total_amount ?? 0) - amount) > 0.01) {
    return { error: fail("The advance receipt doesn't match this customer and amount.") };
  }
  return { receipt };
}

/**
 * Builds the MongoDB write for an action on a multi-product ticket.
 * Returns { filter, update, arrayFilters? } or { error, status }.
 */
export async function buildMultiAction({ input, ticket, session, store, request, now }) {
  const items = ticket.items ?? [];
  const statuses = new Map(items.map((i) => [i.item_id, itemStatus(ticket, i)]));
  const ticketStatus = multiTicketStatus(ticket, [...statuses.values()]);
  const filter = { env: ticket.env, ticket_number: ticket.ticket_number, status: ticket.status };
  const log = (action, changes, itemId = null) => ({ ...historyEntry(session, store, action, changes), item_id: itemId });

  if (input.action === 'add_comment') {
    if (input.item_id && !statuses.has(input.item_id)) return fail('Product not found.', 404);
    return {
      filter: { env: ticket.env, ticket_number: ticket.ticket_number },
      update: { $set: { updated_at: now }, $push: { comments: commentEntry(session, store, input.item_id, input.text) } },
    };
  }

  if (input.action === 'add_item') {
    if ([TICKET_STATUS.CANCELLED, TICKET_STATUS.ORDER_PLACED].includes(ticketStatus)) {
      return fail('Products can only be added before the order is placed.');
    }
    const activeCount = [...statuses.values()].filter((s) => s !== TICKET_STATUS.CANCELLED).length;
    if (activeCount >= TICKET_MAX_ITEMS) return fail(`A ticket can hold up to ${TICKET_MAX_ITEMS} products.`);
    const seq = Math.max(0, ...items.map((i) => i.item_seq ?? 0)) + 1;
    const images = await claimFiles(request, input.file_ids, ticket.ticket_number);
    if (!images) return fail('One or more uploaded files are invalid. Please re-upload.', 400);
    const item = newTicketItem(ticket.ticket_number, seq, input.specs, images, now);
    return {
      filter: { ...filter, 'items.item_id': { $ne: item.item_id } },
      update: {
        $set: { updated_at: now },
        $push: { items: item, history: log('item_added', { category: input.specs.category }, item.item_id) },
      },
    };
  }

  if (input.action === 'confirm_order') {
    const active = items.filter((i) => statuses.get(i.item_id) !== TICKET_STATUS.CANCELLED);
    if (!canConfirmOrder(active.map((i) => statuses.get(i.item_id)))) {
      return fail('Every product must have its G2D estimate approved by the customer before the order is confirmed.');
    }
    const pending = active.filter((i) => statuses.get(i.item_id) === TICKET_STATUS.G2D_APPROVED);
    const sent = new Map(input.order.items.map((i) => [i.item_id, i]));
    if (sent.size !== pending.length || pending.some((i) => !sent.has(i.item_id))) {
      return fail('The products on this ticket have changed. Refresh and try again.');
    }
    for (const item of pending) {
      const latest = g2dEstimates(itemView(ticket, item))[0];
      if (!latest || latest.round !== sent.get(item.item_id).round) {
        return fail('The products on this ticket have changed. Refresh and try again.');
      }
    }

    // Rates are always today's from OrnaVerse for each product's karat, never the client's figure.
    const rates = new Map();
    for (const karat of new Set(input.order.items.map((i) => i.karat))) {
      let rate;
      try {
        rate = await getTodayGoldRate(session, karat);
      } catch (err) {
        console.error('[ticketing] gold rate', err?.message);
        return fail("Could not fetch today's gold rate from OrnaVerse. Please try again.", 502);
      }
      if (!rate) return fail(`Today's gold rate for ${karat} isn't set for this store.`);
      rates.set(karat, rate);
    }

    let advance = null;
    if (input.order.amount_received) {
      const { error, receipt } = await verifyAdvanceReceipt(session, ticket, input.order.advance_receipt_id, input.order.amount_received);
      if (error) return error;
      advance = {
        transaction_id: input.order.advance_receipt_id,
        document_no: receipt.document_no ?? null,
        amount: receipt.total_amount,
        document_date: receipt.document_date ?? null,
        received_on: input.order.advance_received_on,
        payments: input.order.payments,
        item_ids: pending.map((i) => i.item_id),
        created_at: now,
        created_by: session.username,
      };
      if ((ticket.advances ?? []).some((a) => a.transaction_id === advance.transaction_id)) {
        return fail('This advance receipt is already attached to the ticket.');
      }
    }

    const set = { updated_at: now, ...TICKET_OPEN };
    const arrayFilters = [];
    const confirmed = [];
    pending.forEach((item, n) => {
      const line = sent.get(item.item_id);
      const details = {
        order_date: input.order.order_date,
        order_amount: line.order_amount,
        expected_delivery_date: line.expected_delivery_date,
        karat: line.karat,
        metal: line.metal,
        size: line.size,
        description: line.description,
        gold_rate: rates.get(line.karat),
        round: line.round,
        confirmed_at: now,
        confirmed_by: session.username,
      };
      confirmed.push(details);
      Object.assign(set, prefixed(`items.$[i${n}]`, {
        ...PANEL_STATE.CAD_DESIGN,
        awaiting_cad_since: now,
        order_details: details,
        order_date: details.order_date,
        order_amount: details.order_amount,
        gold_rate: details.gold_rate,
        expected_delivery_date: details.expected_delivery_date,
        metal: [details.karat, details.metal].filter(Boolean).join(' '),
        size: details.size,
        'specs.karat': details.karat,
        'specs.metal': details.metal,
        'specs.size': details.size,
        'specs.description': details.description,
      }));
      arrayFilters.push({ [`i${n}.item_id`]: item.item_id });
    });

    const alreadyConfirmed = active.filter((i) => i.order_details).reduce((t, i) => t + (i.order_details.order_amount || 0), 0);
    const orderAmount = alreadyConfirmed + confirmed.reduce((t, d) => t + d.order_amount, 0);
    const advances = [...(ticket.advances ?? []), ...(advance ? [advance] : [])];
    const amountReceived = advances.reduce((t, a) => t + (a.amount || 0), 0);
    const orderDate = ticket.order_details?.order_date ?? input.order.order_date;
    Object.assign(set, {
      order_details: {
        ...(ticket.order_details ?? {}),
        order_date: orderDate,
        order_amount: orderAmount,
        amount_received: amountReceived,
        advance_received_on: advance?.received_on ?? ticket.order_details?.advance_received_on ?? null,
        remarks: input.order.remarks ?? ticket.order_details?.remarks ?? null,
        confirmed_at: ticket.order_details?.confirmed_at ?? now,
        confirmed_by: ticket.order_details?.confirmed_by ?? session.username,
      },
      order_date: orderDate,
      order_amount: orderAmount,
      amount_received: amountReceived,
      advance_received_date: advance?.received_on ?? ticket.advance_received_date ?? null,
    });

    return {
      filter: { ...filter, $and: pending.map((i) => ({ items: { $elemMatch: { item_id: i.item_id, status: i.status } } })) },
      update: {
        $set: set,
        $push: {
          ...(advance && { advances: advance }),
          history: log('order_confirmed', {
            item_ids: pending.map((i) => i.item_id),
            order_amount: confirmed.reduce((t, d) => t + d.order_amount, 0),
            amount_received: advance?.amount ?? null,
            advance_receipt_no: advance?.document_no ?? null,
          }),
        },
      },
      arrayFilters,
    };
  }

  if (input.action === 'cancel') {
    if (ticketStatus === TICKET_STATUS.CANCELLED) return fail('This ticket is already cancelled.');
    if (ticket.pos_order?.transaction_id) return fail(`Order ${ticket.pos_order.document_no} is already placed — cancel it from Orders instead.`);
    const cancelFields = { cancel_reason: input.reason, cancelled_at: now, cancelled_by: session.username };
    return {
      filter,
      update: {
        $set: {
          ...PANEL_STATE.CANCELLED,
          ...cancelFields,
          updated_at: now,
          ...prefixed('items.$[open]', { ...PANEL_STATE.CANCELLED, ...cancelFields }),
        },
        $push: { history: log('ticket_cancelled', { reason: input.reason }) },
      },
      arrayFilters: [{ 'open.status': { $ne: PANEL_STATE.CANCELLED.status } }],
    };
  }

  if (input.action === 'acknowledge_pricing') {
    if (ticketStatus !== TICKET_STATUS.FINAL_RECEIVED) {
      return fail('Pricing can only be acknowledged once every product has its final details.');
    }
    return {
      filter,
      update: {
        $set: { updated_at: now },
        $push: { history: log('pricing_acknowledged', { mismatches: input.mismatches, note: input.note }) },
      },
    };
  }

  if (input.action === 'order_placed') {
    if (ticketStatus !== TICKET_STATUS.FINAL_RECEIVED) {
      return fail('The order can only be linked once every product has its final details.');
    }
    let order;
    try {
      order = (await postUpstream(session, 'Services/POS/Order/Retrieve', { EntityId: input.transaction_id }))?.Entity;
    } catch (err) {
      console.error('[ticketing] order retrieve', err?.message);
      return fail('Could not verify the order with OrnaVerse.', 502);
    }
    if (!order || order.party_id !== ticket.customer_party_id) return fail("This order doesn't belong to the ticket's customer.");
    const posOrder = {
      transaction_id: input.transaction_id,
      document_no: order.document_no ?? null,
      net_amount: order.net_amount ?? null,
      placed_at: now,
      placed_by: session.username,
    };
    return {
      filter: { ...filter, pos_order: null },
      update: {
        $set: { pos_order: posOrder, status: TICKET_STATUS.ORDER_PLACED, status_label: 'Order placed', updated_at: now },
        $push: { history: log('pos_order_placed', { document_no: posOrder.document_no, net_amount: posOrder.net_amount }) },
      },
    };
  }

  // Everything below acts on one product.
  const item = items.find((i) => i.item_id === input.item_id);
  if (!item) return fail('Product not found.', 404);
  const status = statuses.get(item.item_id);
  const view = itemView(ticket, item);
  const P = (field) => `items.$[it].${field}`;
  const itemFilter = (extra = {}) => ({ ...filter, items: { $elemMatch: { item_id: item.item_id, status: item.status, ...extra } } });
  const arrayFilters = [{ 'it.item_id': item.item_id }];

  if (input.action === 'update_request') {
    if (status !== TICKET_STATUS.AWAITING_G2D) {
      return fail('The request can only be updated while waiting for the G2D estimate.');
    }
    if ((item.reference_images?.length ?? 0) + input.file_ids.length > TICKET_ITEM_MAX_FILES) {
      return fail(`A product can have up to ${TICKET_ITEM_MAX_FILES} reference images.`, 400);
    }
    const requested = requestedSpecs(item);
    const specChanges = Object.fromEntries(Object.entries(input.specs)
      .filter(([key, value]) => JSON.stringify(requested[key] ?? null) !== JSON.stringify(value))
      .map(([key, value]) => [key, { from: requested[key] ?? null, to: value }]));
    if (!Object.keys(specChanges).length && !input.file_ids.length) return fail('Nothing was changed.', 400);
    const newImages = await claimFiles(request, input.file_ids, ticket.ticket_number);
    if (!newImages) return fail('One or more uploaded files are invalid. Please re-upload.', 400);
    const changes = { ...specChanges, ...(newImages.length && { reference_images_added: newImages.map((f) => f.file_name) }) };
    return {
      filter: itemFilter(),
      update: {
        $set: {
          ...Object.fromEntries(Object.entries(specChanges).map(([key, { to }]) => [P(`specs.${key}`), to])),
          [P('requested_specs')]: input.specs,
          updated_at: now,
        },
        $push: {
          [P('reference_images')]: { $each: newImages },
          history: log('request_updated', changes, item.item_id),
        },
      },
      arrayFilters,
    };
  }

  if (input.action === 'approve_g2d' || input.action === 'reject_g2d') {
    const estimate = g2dEstimates(view)[0];
    if (status !== TICKET_STATUS.G2D_SHARED || !estimate || estimate.round !== input.round) {
      return fail('Only the latest shared G2D estimate can be approved or sent back.');
    }
    const approved = input.action === 'approve_g2d';
    return {
      filter: itemFilter({ 'g2d_decisions.round': { $ne: estimate.round } }),
      update: {
        $set: {
          ...prefixed('items.$[it]', approved
            ? PANEL_STATE.G2D_APPROVED
            : { ...PANEL_STATE.G2D_REQUESTED, awaiting_cad_since: now, customer_feedback: input.feedback }),
          updated_at: now,
        },
        $push: {
          [P('g2d_decisions')]: {
            round: estimate.round,
            decision: approved ? 'approved' : 'rejected',
            feedback: approved ? null : input.feedback,
            decided_at: now,
            decided_by: session.username,
          },
          history: log(approved ? 'g2d_approved' : 'g2d_rejected', { round: estimate.round, ...(!approved && { feedback: input.feedback }) }, item.item_id),
        },
      },
      arrayFilters,
    };
  }

  if (input.action === 'approve_design' || input.action === 'reject_design') {
    const design = ticketDesigns(view)[0];
    if (status !== TICKET_STATUS.AWAITING_CUSTOMER_FEEDBACK || !design || design.version !== input.version) {
      return fail('Only the latest shared design can be approved or rejected.');
    }
    const approved = input.action === 'approve_design';
    const hasCadVersion = item.cadVersions?.some((v) => String(v.version) === design.version);
    return {
      filter: itemFilter({ 'design_decisions.version': { $ne: design.version } }),
      update: {
        $set: {
          ...(hasCadVersion && { [P('cadVersions.$[v].status')]: approved ? 'approved' : 'changes_requested' }),
          ...prefixed('items.$[it]', approved
            ? { ...PANEL_STATE.SKU_PENDING, approved_version: design.version }
            : { ...PANEL_STATE.CAD_DESIGN, awaiting_cad_since: now, customer_feedback: input.feedback }),
          updated_at: now,
        },
        $push: {
          [P('design_decisions')]: {
            version: design.version,
            decision: approved ? 'approved' : 'rejected',
            feedback: approved ? null : input.feedback,
            decided_at: now,
            decided_by: session.username,
          },
          history: log(approved ? 'design_approved' : 'design_rejected', { version: design.version, ...(!approved && { feedback: input.feedback }) }, item.item_id),
        },
      },
      arrayFilters: hasCadVersion ? [...arrayFilters, { 'v.version': design.version }] : arrayFilters,
    };
  }

  if (input.action === 'reopen_final') {
    const design = ticketDesigns(view)[0];
    if (status !== TICKET_STATUS.FINAL_RECEIVED || !design || !item.estimation) {
      return fail('Changes can only be requested once the final details are received and before the order is placed.');
    }
    const toCad = input.target === 'cad';
    const revision = {
      target: input.target,
      reason: input.reason,
      estimation: item.estimation,
      manufacturing_order_number: item.orderNumber ?? item.order_number ?? null,
      panel_status: item.status ?? null,
      panel_status_label: item.status_label ?? null,
      design_version: design.version,
      requested_at: now,
      requested_by: session.username,
    };
    const hasCadVersion = toCad && item.cadVersions?.some((v) => String(v.version) === design.version);
    return {
      filter: { ...itemFilter({ estimation: { $exists: true } }), pos_order: null },
      update: {
        $set: {
          ...prefixed('items.$[it]', toCad
            ? { ...PANEL_STATE.CAD_DESIGN, awaiting_cad_since: now, customer_feedback: input.reason }
            : { ...PANEL_STATE.SKU_PENDING, customer_feedback: input.reason }),
          ...(hasCadVersion && { [P('cadVersions.$[v].status')]: 'changes_requested' }),
          updated_at: now,
        },
        $unset: { [P('estimation')]: '' },
        $push: {
          [P('final_revisions')]: revision,
          ...(toCad && {
            [P('design_decisions')]: {
              version: design.version,
              decision: 'rejected',
              feedback: input.reason,
              decided_at: now,
              decided_by: session.username,
              after_final: true,
            },
          }),
          history: log(toCad ? 'final_reopened_cad' : 'final_reopened', { version: design.version, reason: input.reason }, item.item_id),
        },
      },
      arrayFilters: hasCadVersion ? [...arrayFilters, { 'v.version': design.version }] : arrayFilters,
    };
  }

  if (input.action === 'cancel_item') {
    if (status === TICKET_STATUS.CANCELLED) return fail('This product is already cancelled.');
    if (ticketStatus === TICKET_STATUS.ORDER_PLACED) return fail('The order is already placed for this ticket.');
    const cancelFields = { cancel_reason: input.reason, cancelled_at: now, cancelled_by: session.username };
    const remaining = items.filter((i) => i.item_id !== item.item_id && statuses.get(i.item_id) !== TICKET_STATUS.CANCELLED);
    const set = { ...prefixed('items.$[it]', { ...PANEL_STATE.CANCELLED, ...cancelFields }), updated_at: now };
    if (!remaining.length) {
      Object.assign(set, PANEL_STATE.CANCELLED, {
        cancel_reason: `All products cancelled. Last: ${input.reason}`, cancelled_at: now, cancelled_by: session.username,
      });
    } else if (ticket.order_details) {
      const orderAmount = remaining.reduce((t, i) => t + (i.order_details?.order_amount || 0), 0);
      Object.assign(set, { order_amount: orderAmount, 'order_details.order_amount': orderAmount });
    }
    return {
      filter: itemFilter(),
      update: { $set: set, $push: { history: log('item_cancelled', { reason: input.reason }, item.item_id) } },
      arrayFilters,
    };
  }

  return fail('Unsupported action.', 400);
}
