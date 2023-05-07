enum Color {
    Red = "\x1b[31m",
    Green = "\x1b[32m",
    Cyan = "\x1b[36m",
    Clear = "\x1b[0m",
}

enum Type {
    INFO = "MESSAGE",
    ERROR = "WARNING",
    SUCCESS = "SUCCESS",
}

/**
 * @description Debug Logger function
 * @param {string} message Message to be logged
 * @param {Color} color Color for the message to be displayed as
 * @returns {void}
 */
const logger = (message: string, type: Type, color: Color): void => {
    const date = new Date();
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    console.log(`${color}%s${Color.Clear}`, `[${h}:${m}:${s}.${ms}]    [${type}]    ${message}`);
}

class Logger {
    Info(message: string) { logger(message, Type.INFO, Color.Cyan) }
    Error(message: string) { logger(message, Type.ERROR, Color.Red) }
    Success(message: string) { logger(message, Type.SUCCESS, Color.Green) }
}

export const Log = new Logger();
