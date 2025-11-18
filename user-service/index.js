const express = require('express');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

const producer = kafka.producer();

// Connect to Kafka
const connectProducer = async () => {
  try {
    await producer.connect();
    console.log('User Service: Kafka producer connected');
  } catch (error) {
    console.error('User Service: Failed to connect producer', error);
    setTimeout(connectProducer, 5000);
  }
};

connectProducer();

// Create user endpoint
app.post('/users', async (req, res) => {
  try {
    
    const randomUuid = uuidv4();
    
    const user = {
      userId: `User-${randomUuid}`,
      username: req.body.username,
      email: req.body.email,
      adress: req.body.adress,
      phone: req.body.phone,
      timestamp: new Date().toISOString()
    };

    // Publish user created event to Kafka
    await producer.send({
      topic: 'user-events',
      messages: [{
        key: user.userId,
        value: JSON.stringify({
          eventType: 'USER_CREATED',
          data: user
        })
      }]
    });

    console.log(`User created: ${user.userId}`);
    res.status(201).json({ message: 'User created', user });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get users endpoint (mock)
app.get('/users', (req, res) => {
  res.json({ message: 'users endpoint', service: 'user-service' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'user-service' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`user Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await producer.disconnect();
  process.exit(0);
});