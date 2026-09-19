export function logInfo(message, data = {}) {
    console.log(JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        message,
        ...data
    }));
}

export function logError(message, data = {}) {
    console.error(JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        message,
        ...data
    }));
}