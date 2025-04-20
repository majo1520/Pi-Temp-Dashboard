// queue.cjs - Message queue module for asynchronous processing
const dotenv = require('dotenv');
dotenv.config();

// Default configuration
const QUEUE_ENABLED = process.env.QUEUE_ENABLED === 'true';
const QUEUE_TYPE = process.env.QUEUE_TYPE || 'memory'; // 'memory' or 'bull'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MAX_MEMORY_QUEUE_SIZE = parseInt(process.env.MAX_MEMORY_QUEUE_SIZE) || 1000;

// In-memory queue implementation
class MemoryQueue {
  constructor(name, options = {}) {
    this.name = name;
    this.queue = [];
    this.processing = false;
    this.maxSize = options.maxSize || MAX_MEMORY_QUEUE_SIZE;
    this.handlers = new Map();
    
    console.log(`Memory queue "${name}" initialized`);
  }
  
  // Add a job to the queue
  async add(data, options = {}) {
    if (this.queue.length >= this.maxSize) {
      throw new Error(`Queue "${this.name}" is full (max size: ${this.maxSize})`);
    }
    
    const job = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      data,
      options,
      status: 'waiting',
      addedAt: new Date()
    };
    
    this.queue.push(job);
    console.log(`Added job to "${this.name}" queue (${this.queue.length} jobs pending)`);
    
    // Start processing if not already running
    if (!this.processing) {
      this.process();
    }
    
    return job;
  }
  
  // Register a processor function
  on(eventName, handlerFn) {
    if (eventName === 'completed' || eventName === 'failed') {
      this.handlers.set(eventName, handlerFn);
    } else {
      throw new Error(`Unsupported event type: ${eventName}`);
    }
  }
  
  // Process jobs in the queue
  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    try {
      const job = this.queue.shift();
      job.status = 'processing';
      job.startedAt = new Date();
      
      try {
        const result = await this.processorFn(job.data, job);
        job.status = 'completed';
        job.finishedAt = new Date();
        job.result = result;
        
        // Call completed handler if registered
        const completedHandler = this.handlers.get('completed');
        if (completedHandler) {
          await completedHandler(job);
        }
      } catch (error) {
        job.status = 'failed';
        job.finishedAt = new Date();
        job.error = error.message;
        
        console.error(`Error processing job in queue "${this.name}":`, error);
        
        // Call failed handler if registered
        const failedHandler = this.handlers.get('failed');
        if (failedHandler) {
          await failedHandler(job, error);
        }
      }
    } catch (error) {
      console.error(`Unexpected error in queue "${this.name}":`, error);
    } finally {
      this.processing = false;
      
      // Continue processing if there are more jobs
      if (this.queue.length > 0) {
        setTimeout(() => this.process(), 0);
      }
    }
  }
  
  // Register processor function
  registerProcessor(processorFn) {
    if (typeof processorFn !== 'function') {
      throw new Error('Processor must be a function');
    }
    
    this.processorFn = processorFn;
    
    // Start processing if there are jobs
    if (this.queue.length > 0 && !this.processing) {
      this.process();
    }
  }
  
  // Get queue stats
  getStats() {
    return {
      name: this.name,
      size: this.queue.length,
      maxSize: this.maxSize,
      isProcessing: this.processing
    };
  }
}

// Main queue factory function
let bullQueue;

// Create and return appropriate queue instance
async function createQueue(name, options = {}) {
  if (!QUEUE_ENABLED) {
    console.log(`Message queue is disabled, "${name}" queue will not be created`);
    return null;
  }
  
  if (QUEUE_TYPE === 'bull') {
    try {
      // Import bull dynamically to avoid dependency issues when not used
      if (!bullQueue) {
        const { Queue } = await import('bull');
        bullQueue = Queue;
      }
      
      // Create a Bull queue
      const queue = new bullQueue(name, REDIS_URL, options);
      console.log(`Bull queue "${name}" initialized with Redis at ${REDIS_URL}`);
      return queue;
    } catch (error) {
      console.error(`Error creating Bull queue "${name}":`, error.message);
      console.log(`Falling back to memory queue for "${name}"`);
      return new MemoryQueue(name, options);
    }
  } else {
    // Use memory queue
    return new MemoryQueue(name, options);
  }
}

module.exports = {
  createQueue
}; 