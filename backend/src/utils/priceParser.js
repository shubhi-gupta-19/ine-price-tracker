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

    // Strip zero-width spaces (\u200B, \u200C, \u200D, \uFEFF), non-breaking spaces (\u00A0)
    const sanitized = raw
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .trim();

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