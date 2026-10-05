// src/services/fileUploadService.js
//
// OrnaVerse's generic (not domain-specific) Serenity temp-file upload
// endpoint. CONFIRMED LIVE 2026-10-02 (real capture of OrnaVerse's own
// Returns screen's cross-store photo-attach flow): `POST File/TemporaryUpload`,
// multipart/form-data, response `{ TemporaryFile: "temporary/<guid>.png",
// Size, IsImage, Width, Height }`.
//
// Two-step contract for ANY file field on ANY entity (Interstore Return line
// photos, Customer PAN/Other Document, ...): upload the raw file here to get
// a `TemporaryFile` path, then save THAT path onto the owning entity's own
// field via its normal Update/Create call — never send a raw base64 data URI
// directly into that field (confirmed 500s, e.g. Customer/Update's
// pan_document on 2026-09-17). OrnaVerse promotes the temp file into
// permanent storage itself once the owning entity is saved.
//
// Originally written for interstoreReturnService.js; moved here once customer
// PAN/Other Document upload needed the exact same mechanism — genuinely
// cross-domain, not IRR-specific.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

/**
 * @param {File} file
 * @returns {Promise<string>} the `TemporaryFile` path, e.g.
 *   "temporary/941d9a4f75ea4f3588b81c3d9736f401.png" — NOT a data URI.
 */
export async function uploadTemporaryFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axiosInstance.post(API.FILES.TEMPORARY_UPLOAD, formData, {
    // Content-Type deliberately left for axios/the browser to set (with the
    // correct multipart boundary) rather than the instance's default
    // application/json — a FormData body lets it compute this.
    headers: { 'Content-Type': undefined },
  });
  return response.data?.TemporaryFile;
}
