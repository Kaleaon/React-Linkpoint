/**
 * Linkpoint PWA - Utility Functions
 */

export const Utils = {
  /**
   * Generate UUID v4
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * Format timestamp to readable string
   */
  formatTime(timestamp: number) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  /**
   * Show toast notification
   */
  showToast(message: string, type: string = 'info', duration: number = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type} p-4 mb-2 rounded shadow-lg transition-all duration-300 transform translate-x-0`;
    
    // Simple Tailwind-based coloring
    if (type === 'success') toast.classList.add('bg-green-600', 'text-white');
    else if (type === 'error') toast.classList.add('bg-red-600', 'text-white');
    else if (type === 'warning') toast.classList.add('bg-yellow-500', 'text-black');
    else toast.classList.add('bg-blue-600', 'text-white');

    const escapedMessage = String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    toast.innerHTML = `
      <div class="toast-content">
        <strong>${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
        <p>${escapedMessage}</p>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (container.contains(toast)) container.removeChild(toast);
      }, 300);
    }, duration);
  },

  /**
   * Local storage wrapper with error handling
   */
  storage: {
    get(key: string, defaultValue: any = null) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch (e) {
        console.error('Storage get error:', e);
        return defaultValue;
      }
    },

    set(key: string, value: any) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('Storage set error:', e);
        return false;
      }
    },

    remove(key: string) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.error('Storage remove error:', e);
        return false;
      }
    }
  },

  /**
   * Debounce function
   */
  debounce(func: Function, wait: number) {
    let timeout: any;
    return function executedFunction(...args: any[]) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function
   */
  throttle(func: Function, limit: number) {
    let inThrottle: boolean;
    return function(this: any, ...args: any[]) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Deep clone object
   */
  deepClone(obj: any) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Format file size
   */
  formatFileSize(bytes: number) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  /**
   * Parse query string
   */
  parseQueryString(url: string = window.location.href) {
    const params: Record<string, string> = {};
    const queryString = url.split('?')[1];
    if (queryString) {
      queryString.split('&').forEach(param => {
        const [key, value] = param.split('=');
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      });
    }
    return params;
  },

  /**
   * Validate email
   */
  isValidEmail(email: string) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  /**
   * Clamp value between min and max
   */
  clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  },

  /**
   * Linear interpolation
   */
  lerp(start: number, end: number, t: number) {
    return start * (1 - t) + end * t;
  },

  /**
   * Check if device is mobile
   */
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  },

  /**
   * Get device info
   */
  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      language: navigator.language,
      isMobile: this.isMobile(),
      isOnline: navigator.onLine,
      cookiesEnabled: navigator.cookieEnabled
    };
  },

  /**
   * Async sleep
   */
  sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Retry async function
   */
  async retry(fn: Function, retries: number = 3, delay: number = 1000): Promise<any> {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;
      await this.sleep(delay);
      return this.retry(fn, retries - 1, delay * 2);
    }
  },

  /**
   * Event emitter
   */
  EventEmitter: class {
    private events: Record<string, Function[]> = {};

    on(event: string, listener: Function) {
      if (!this.events[event]) {
        this.events[event] = [];
      }
      this.events[event].push(listener);
    }

    off(event: string, listener: Function) {
      if (!this.events[event]) return;
      this.events[event] = this.events[event].filter(l => l !== listener);
    }

    emit(event: string, ...args: any[]) {
      if (!this.events[event]) return;
      this.events[event].forEach(listener => listener(...args));
    }

    once(event: string, listener: Function) {
      const onceWrapper = (...args: any[]) => {
        listener(...args);
        this.off(event, onceWrapper);
      };
      this.on(event, onceWrapper);
    }
  }
};
