/**
 * X2 — escapeHtml: util defensiva para engine demo.
 * Pre-interpolacion de strings que se renderizan en innerHTML / status HTML
 * del demo del engine. defense-in-depth: aunque error.message viene del
 * bridge local (confiable), nunca debe confiarse ciegamente en su contenido.
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}