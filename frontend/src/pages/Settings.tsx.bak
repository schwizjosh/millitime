import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
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
