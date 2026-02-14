export class Logger {
  private level: string;

  constructor(level: string) {
    this.level = level;
  }

  private shouldLog(lvl: string): boolean {
    const order = ["debug", "info", "warn", "error"];
    return order.indexOf(lvl) >= order.indexOf(this.level);
  }

  debug(component: string, msg: string) {
    if (this.shouldLog("debug")) {
      console.log(`[DEBUG] [${component}] ${msg}`);
    }
  }

  info(component: string, msg: string) {
    if (this.shouldLog("info")) {
      console.log(`[INFO] [${component}] ${msg}`);
    }
  }

  warn(component: string, msg: string) {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] [${component}] ${msg}`);
    }
  }

  error(component: string, msg: string) {
    console.error(`[ERROR] [${component}] ${msg}`);
  }
        }
