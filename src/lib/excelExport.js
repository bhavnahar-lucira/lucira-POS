// Submits a hidden form POST to our own server route, which generates the
// workbook and returns it as a real file response (Content-Disposition) —
// the same mechanism OrnaVerse's own Excel export uses (confirmed live: a
// hidden form POST to its own server endpoint, target="_blank"). A
// client-side Blob + <a download> download (tried first, then with
// file-saver) was unreliable on a real user's machine, saving with a
// generated filename and no extension — a genuine server response with
// browser-native download handling can't hit that class of bug at all,
// since there's no Blob URL or JS-simulated click involved.
//
// sheets: [{ name, columns, rows }] — one tab per entry.
export function downloadXlsx(filename, sheets) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/reports/export-xlsx';
  form.target = '_blank';
  form.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.value = JSON.stringify({ filename, sheets });
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}
