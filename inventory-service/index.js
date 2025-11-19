const express = require('express');
const { Kafka } = require('kafkajs');

const app = express();
app.use(express.json());

const kafka = new Kafka({
  clientId: 'inventory-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'inventory-group' });

// Mock inventory
const inventory = {
  'ITEM-001': { name: 'Laptop', stock: 50 },
  'ITEM-002': { name: 'Mouse', stock: 200 },
  'ITEM-003': { name: 'Keyboard', stock: 100 }
};

const connectKafka = async () => {
  try {
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: false });
    await consumer.subscribe({ topic: 'product-events', fromBeginning: false });
    
    console.log('Inventory Service: Kafka connected');

    // Consume order events
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const event = JSON.parse(message.value.toString());

        if (topic==='order-events'){
                    if (event.eventType === 'ORDER_CREATED') {
          console.log(`Processing order: ${event.data.orderId}`);
          
          // Check inventory
          const available = event.data.items.every(item => {
            const stock = inventory[item.itemId];
            return stock && stock.stock >= item.quantity;
          });

          // Update inventory if available
          if (available) {
            event.data.items.forEach(item => {
              inventory[item.itemId].stock -= item.quantity;
            });
          }

          // Publish inventory event
          await producer.send({
            topic: 'inventory-events',
            messages: [{
              key: event.data.orderId,
              value: JSON.stringify({
                eventType: available ? 'INVENTORY_RESERVED' : 'INVENTORY_INSUFFICIENT',
                data: {
                  orderId: event.data.orderId,
                  available,
                  timestamp: new Date().toISOString()
                }
              })
            }]
          });

          console.log(`Inventory ${available ? 'reserved' : 'insufficient'} for order: ${event.data.orderId}`);
        }
      }


      else if(topic==='product-events'){

        if (event.eventType==='PRODUCT_CREATED'){
            const product=event.data
            // read quantity from event data; fall back to 0 if not provided
            const qty = (product && product.quantity) || event.quantity || 0
            inventory[product.productId] = { name: product.name, stock: Number(qty) };

            console.log('Inventory updated with new product:', product.productId, 'stock:', inventory[product.productId].stock);
        }

      }


        }
        

    });
  } catch (error) {
    console.error('Inventory Service: Kafka connection failed', error);
    setTimeout(connectKafka, 5000);
  }
};

connectKafka();

// Get inventory endpoint
app.get('/inventory', (req, res) => {
  res.json({ inventory });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'inventory-service' });
});

const PORT = 3003;
app.listen(PORT, () => {
  console.log(`Inventory Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await consumer.disconnect();
  await producer.disconnect();
  process.exit(0);
});