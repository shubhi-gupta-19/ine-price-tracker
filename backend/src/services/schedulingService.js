export function calculateNextScrape(frequencyMinutes) {
    const minutes = Number(frequencyMinutes) || 60;
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}