const express = require('express');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const products=[]

const kafka = new Kafka({
  clientId: 'product-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

const producer = kafka.producer();

// Connect to Kafka
const connectProducer = async () => {
  try {
    await producer.connect();
    console.log('Product Service: Kafka producer connected');
  } catch (error) {
    console.error('Product Service: Failed to connect producer', error);
    setTimeout(connectProducer, 5000);
  }
};

connectProducer();

// Create product endpoint
app.post('/products', async (req, res) => {
  try {
    
    const randomUuid = uuidv4();
    
    const product = {
      productId: `PRO-${randomUuid}`,
      name: req.body.name,
      price: req.body.price,
      description: req.body.description,
      quantity: req.body.quantity,
      timestamp: new Date().toISOString()
    };

    // Publish product created event to Kafka (include quantity inside product data)
    await producer.send({
      topic: 'product-events',
      messages: [{
        key: product.productId,
        value: JSON.stringify({
          eventType: 'PRODUCT_CREATED',
          data: product
        })
      }]
    });

    products.push(product)

    console.log(`product created: ${product.productId}`);
    res.status(201).json({ message: 'product created', product });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Get products endpoint (mock)
app.get('/products', (req, res) => {
  res.json({ message: 'products endpoint', service: 'product-service',products:products });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'product-service' });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`product Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await producer.disconnect();
  process.exit(0);
});