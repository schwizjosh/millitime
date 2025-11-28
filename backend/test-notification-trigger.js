const { Client } = require('pg');

async function testNotifications() {
  const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/millitime';

  console.log('Connecting to:', connectionString);

  const client = new Client({ connectionString });

  client.on('notification', (msg) => {
    console.log('📨 NOTIFICATION RECEIVED:');
    console.log('  Channel:', msg.channel);
    console.log('  Payload:', msg.payload);
    try {
      const parsed = JSON.parse(msg.payload);
      console.log('  Parsed:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('  (not JSON)');
    }
  });

  client.on('error', (err) => {
    console.error('❌ Client error:', err.message);
  });

  await client.connect();
  console.log('✅ Connected');

  await client.query('LISTEN new_signal');
  console.log('✅ Listening to "new_signal" channel');

  console.log('\n⏳ Waiting for notifications... (will run for 30 seconds)');
  console.log('   Try inserting a signal to test:\n');
  console.log('   PGPASSWORD="${MILLITIME_DB_PASS:-postgres}" psql -h localhost -U postgres -d millitime -c "');
  console.log('   INSERT INTO signals (user_id, coin_id, coin_symbol, signal_type, price, strength, message)');
  console.log('   VALUES (1, \'test\', \'TEST\', \'BUY\', 100, \'STRONG\', \'Test notification\');"');
  console.log('');

  // Keep alive for 30 seconds
  await new Promise(resolve => setTimeout(resolve, 30000));

  console.log('\n✅ Test complete. Disconnecting...');
  await client.end();
}

testNotifications().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
