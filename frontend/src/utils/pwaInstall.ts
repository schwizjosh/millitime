// PWA Install Prompt Utility
export class PWAInstaller {
  private deferredPrompt: any = null;
  private installButton: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the default mini-infobar
      e.preventDefault();
      // Store the event for later use
      this.deferredPrompt = e;
      // Show custom install button
      this.showInstallButton();
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed successfully');
      this.hideInstallButton();
      this.deferredPrompt = null;
    });

    // Register service worker
    this.registerServiceWorker();
  }

  private async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  private showInstallButton() {
    // Check if button already exists
    if (document.getElementById('pwa-install-button')) {
      return;
    }

    // Create install button
    const button = document.createElement('button');
    button.id = 'pwa-install-button';
    button.className = 'pwa-install-btn';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Install App</span>
    `;

    button.addEventListener('click', () => this.promptInstall());

    // Add button to page
    document.body.appendChild(button);
    this.installButton = button;

    // Add CSS for button
    this.addInstallButtonStyles();
  }

  private addInstallButtonStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .pwa-install-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 24px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);
        color: white;
        border: none;
        border-radius: 50px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        animation: slideIn 0.5s ease-out;
      }

      .pwa-install-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(139, 92, 246, 0.5);
      }

      .pwa-install-btn:active {
        transform: translateY(0);
      }

      .pwa-install-btn svg {
        animation: bounce 2s infinite;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(100px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes bounce {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-4px);
        }
      }

      @media (max-width: 640px) {
        .pwa-install-btn {
          bottom: 16px;
          right: 16px;
          padding: 12px 20px;
          font-size: 14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private hideInstallButton() {
    if (this.installButton) {
      this.installButton.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => {
        this.installButton?.remove();
        this.installButton = null;
      }, 300);
    }
  }

  public async promptInstall() {
    if (!this.deferredPrompt) {
      return;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);

    // Clear the deferredPrompt
    this.deferredPrompt = null;

    if (outcome === 'accepted') {
      this.hideInstallButton();
    }
  }
}

// Export singleton instance
export const pwaInstaller = new PWAInstaller();
