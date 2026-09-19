export function parsePrice(text) {
    if (text === null || text === undefined) {
        return null;
    }

    const raw = String(text);
    if (!raw.trim()) {
        return null;
    }

    // Check for negative signs
    if (raw.includes("-") && !raw.includes("—")) {
        // e.g., "-17066" or "-₹17066"
        const negativeMatch = raw.match(/-\s*[\d₹$€£]/);
        if (negativeMatch) {
            return null;
        }
    }

    // Convert full-width unicode digits (０-９) to ASCII digits
    let sanitized = raw.replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248));

    // Strip zero-width spaces (\u200B, \u200C, \u200D, \uFEFF), non-breaking spaces (\u00A0)
    sanitized = sanitized
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .trim();

    // Remove tax / trailing annotations before digit extraction
    sanitized = sanitized.replace(/\/-\s*\(.*?\)/gi, "").trim();

    // Collapse spaces interspersed between digits and numeric punctuation (e.g. "2 , 9 9 6" -> "2,996")
    while (/([\d,.])\s+([\d,.])/.test(sanitized)) {
        sanitized = sanitized.replace(/([\d,.])\s+([\d,.])/g, "$1$2");
    }

    // Handle European currency format: e.g. "2.996,00" -> "2996.00"
    if (/\d+\.\d{3},\d{2}/.test(sanitized)) {
        sanitized = sanitized.replace(/\./g, "").replace(/,/g, ".");
    } else if (/\d+\.\d{3}(?!\d)/.test(sanitized) && !sanitized.includes(",")) {
        sanitized = sanitized.replace(/\./g, "");
    }

    // Match numbers with optional decimal, allowing comma thousand separators
    const match = sanitized.match(/(\d[\d,]*(?:\.\d{1,2})?)/);
    if (!match) {
        return null;
    }

    const numberStr = match[1].replace(/,/g, "");
    const number = Number(numberStr);

    if (!Number.isFinite(number) || Number.isNaN(number) || number <= 0) {
        return null;
    }

    return Number(number.toFixed(2));
}