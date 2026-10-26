const fs = require('fs');

class WriteBuffer {
  constructor(options = {}) {
    this.buffer = new Map();
    this.flushInterval = options.interval || 5000;
    this.maxBufferSize = options.maxSize || 50;
    this.timer = null;
  }

  append(filePath, line) {
    if (process.env.AIPROXY_TEST_MODE === 'true') return;
    if (!this.buffer.has(filePath)) this.buffer.set(filePath, []);
    const lines = this.buffer.get(filePath);
    lines.push(line);
    if (lines.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  async flush() {
    for (const [filePath, lines] of this.buffer.entries()) {
      if (lines.length === 0) continue;
      const data = lines.join('');
      this.buffer.set(filePath, []);
      try {
        await fs.promises.appendFile(filePath, data, 'utf8');
      } catch (err) {
        const existing = this.buffer.get(filePath) || [];
        this.buffer.set(filePath, [...lines, ...existing]);
      }
    }
  }

  start() {
    this.timer = setInterval(() => this.flush(), this.flushInterval);
    if (this.timer.unref) this.timer.unref();
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}

const instance = new WriteBuffer();
module.exports = instance;
module.exports.WriteBuffer = WriteBuffer;
