import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Settings.css';

const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [timezone, setTimezone] = useState('UTC');
  const [darkMode, setDarkMode] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Load saved preferences
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    const savedTimezone = localStorage.getItem('timezone') || 'UTC';

    setDarkMode(savedDarkMode);
    setTimezone(savedTimezone);

    // Apply dark mode
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }
  }, [user, navigate]);

  const handleSave = () => {
    // Save to localStorage
    localStorage.setItem('timezone', timezone);
    localStorage.setItem('darkMode', darkMode.toString());
    localStorage.setItem('emailNotifications', emailNotifications.toString());
    localStorage.setItem('pushNotifications', pushNotifications.toString());

    // Apply dark mode
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }

    setSaveMessage('Settings saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const timezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Dubai',
    'Australia/Sydney',
  ];

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h1>Settings</h1>

        {saveMessage && (
          <div className="save-message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            {saveMessage}
          </div>
        )}

        {/* Account Section */}
        <div className="settings-section">
          <h2>Account</h2>
          <div className="settings-group">
            <div className="setting-item">
              <label>Username</label>
              <input type="text" value={user?.username || ''} disabled />
            </div>
            <div className="setting-item">
              <label>Email</label>
              <input type="email" value={user?.email || ''} disabled />
            </div>
          </div>
        </div>

        {/* Appearance Section */}
        <div className="settings-section">
          <h2>Appearance</h2>
          <div className="settings-group">
            <div className="setting-item toggle-item">
              <div>
                <label>Dark Mode</label>
                <p className="setting-description">Enable dark theme for better viewing at night</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Regional Settings */}
        <div className="settings-section">
          <h2>Regional Settings</h2>
          <div className="settings-group">
            <div className="setting-item">
              <label>Timezone</label>
              <p className="setting-description">Set your timezone for accurate signal timestamps</p>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="settings-section">
          <h2>Notifications</h2>
          <div className="settings-group">
            <div className="setting-item toggle-item">
              <div>
                <label>Email Notifications</label>
                <p className="setting-description">Receive trading signals via email</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-item toggle-item">
              <div>
                <label>Push Notifications</label>
                <p className="setting-description">Get instant alerts for new signals</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={pushNotifications}
                  onChange={(e) => setPushNotifications(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button onClick={handleSave} className="btn-save">
            Save Changes
          </button>
          <button onClick={() => navigate('/dashboard')} className="btn-cancel">
            Cancel
          </button>
          <button onClick={logout} className="btn-logout">
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
