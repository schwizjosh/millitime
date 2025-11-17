import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { tradingAPI } from '../services/api';
import type { Exchange } from '../services/api';
import '../styles/Settings.css';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland'
];

export default function Settings() {
  const { user, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const [timezone, setTimezone] = useState(() => {
    return localStorage.getItem('timezone') || 'UTC';
  });

  const [emailNotifications, setEmailNotifications] = useState(() => {
    return localStorage.getItem('emailNotifications') !== 'false';
  });

  const [pushNotifications, setPushNotifications] = useState(() => {
    return localStorage.getItem('pushNotifications') !== 'false';
  });

  // Trading settings
  const [algoEnabled, setAlgoEnabled] = useState(true);
  const [runInBackground, setRunInBackground] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [preferredExchange, setPreferredExchange] = useState('binance');
  const [exchangeApiKey, setExchangeApiKey] = useState('');
  const [exchangeApiSecret, setExchangeApiSecret] = useState('');

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('timezone', timezone);
  }, [timezone]);

  useEffect(() => {
    localStorage.setItem('emailNotifications', emailNotifications.toString());
  }, [emailNotifications]);

  useEffect(() => {
    localStorage.setItem('pushNotifications', pushNotifications.toString());
  }, [pushNotifications]);

  useEffect(() => {
    loadTradingSettings();
    loadExchanges();
  }, []);

  const loadTradingSettings = async () => {
    try {
      const response = await tradingAPI.getSettings();
      const settings = response.data.settings;
      setAlgoEnabled(settings.algo_enabled);
      setRunInBackground(settings.run_in_background);
      setWhatsappNumber(settings.whatsapp_number || '');
      setWhatsappApiKey(settings.whatsapp_api_key || '');
      setPreferredExchange(settings.preferred_exchange || 'binance');
      setExchangeApiKey(settings.exchange_api_key || '');
      setExchangeApiSecret(settings.exchange_api_secret || '');
    } catch (error) {
      console.error('Failed to load trading settings:', error);
    }
  };

  const loadExchanges = async () => {
    try {
      const response = await tradingAPI.getExchanges();
      setExchanges(response.data.exchanges);
    } catch (error) {
      console.error('Failed to load exchanges:', error);
    }
  };

  const saveTradingSettings = async () => {
    setLoading(true);
    setSaveMessage('');

    try {
      await tradingAPI.updateSettings({
        algo_enabled: algoEnabled,
        run_in_background: runInBackground,
        whatsapp_number: whatsappNumber || null,
        whatsapp_api_key: whatsappApiKey || null,
        preferred_exchange: preferredExchange,
        exchange_api_key: exchangeApiKey || null,
        exchange_api_secret: exchangeApiSecret || null,
      });

      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save trading settings:', error);
      setSaveMessage('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="settings-container">
        <h1>Settings</h1>

        <div className="settings-section">
          <h2>Appearance</h2>
          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="dark-mode">Dark Mode</label>
              <p className="setting-description">Toggle dark theme</p>
            </div>
            <label className="toggle-switch">
              <input
                id="dark-mode"
                type="checkbox"
                checked={darkMode}
                onChange={(e) => setDarkMode(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h2>Time & Region</h2>
          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="timezone">Timezone</label>
              <p className="setting-description">Display times in your local timezone</p>
            </div>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="timezone-select"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-section">
          <h2>Trading Settings</h2>

          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="algo-enabled">Algorithm Enabled</label>
              <p className="setting-description">Enable automated trading signals</p>
            </div>
            <label className="toggle-switch">
              <input
                id="algo-enabled"
                type="checkbox"
                checked={algoEnabled}
                onChange={(e) => setAlgoEnabled(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="run-background">Run in Background</label>
              <p className="setting-description">Continue monitoring when not logged in</p>
            </div>
            <label className="toggle-switch">
              <input
                id="run-background"
                type="checkbox"
                checked={runInBackground}
                onChange={(e) => setRunInBackground(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="preferred-exchange">Preferred Exchange</label>
              <p className="setting-description">
                Select your trading exchange (signals will only show coins available on this exchange)
              </p>
            </div>
            <select
              id="preferred-exchange"
              value={preferredExchange}
              onChange={(e) => setPreferredExchange(e.target.value)}
              className="timezone-select"
            >
              {exchanges.map((ex) => (
                <option key={ex.name} value={ex.name}>
                  {ex.displayName} {ex.supportsFutures ? '(Futures ✓)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="whatsapp-number">WhatsApp Number</label>
              <p className="setting-description">Receive signal alerts via WhatsApp (optional)</p>
            </div>
            <input
              id="whatsapp-number"
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+1234567890"
              className="text-input"
            />
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="whatsapp-api-key">WhatsApp API Key</label>
              <p className="setting-description">API key for WhatsApp notifications (optional)</p>
            </div>
            <input
              id="whatsapp-api-key"
              type="password"
              value={whatsappApiKey}
              onChange={(e) => setWhatsappApiKey(e.target.value)}
              placeholder="API Key"
              className="text-input"
            />
          </div>

          <button
            className="save-button"
            onClick={saveTradingSettings}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Trading Settings'}
          </button>
          {saveMessage && <p className="save-message">{saveMessage}</p>}
        </div>

        <div className="settings-section">
          <h2>Notifications</h2>
          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="email-notifications">Email Notifications</label>
              <p className="setting-description">Receive signal alerts via email</p>
            </div>
            <label className="toggle-switch">
              <input
                id="email-notifications"
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <label htmlFor="push-notifications">Push Notifications</label>
              <p className="setting-description">Receive signal alerts as push notifications</p>
            </div>
            <label className="toggle-switch">
              <input
                id="push-notifications"
                type="checkbox"
                checked={pushNotifications}
                onChange={(e) => setPushNotifications(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h2>Account</h2>
          <div className="setting-item">
            <div className="setting-info">
              <label>Username</label>
              <p className="setting-description">{user?.username || 'Not logged in'}</p>
            </div>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <label>Email</label>
              <p className="setting-description">{user?.email || 'Not logged in'}</p>
            </div>
          </div>
          <button className="logout-button" onClick={logout}>Logout</button>
        </div>
      </div>
    </Layout>
  );
}
