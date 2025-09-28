import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../lib/db.js';
import Customer from '../models/Customer.js';
import Driver from '../models/Driver.js';
import Job from '../models/Jobs.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', p), 'utf-8'));


(async () => {
try {
await connectDB(process.env.MONGO_URI);


const customers = read('customer.json');
const drivers = read('drivers.json');


await Promise.all([
Customer.deleteMany({}),
Driver.deleteMany({}),
Job.deleteMany({}),
]);


const createdCustomers = await Customer.insertMany(customers);
const createdDrivers = await Driver.insertMany(drivers);


await Job.insertMany([
{
customerId: createdCustomers[0]._id,
driverId: createdDrivers[0]._id,
status: 'Assigned',
quotedPrice: 15000,
pickupAddress: 'Ikeja City Mall, Lagos',
serviceType: 'delivery',
notes: 'Fragile items',
},
{
customerId: createdCustomers[1]._id,
status: 'Unassigned',
quotedPrice: 22000,
pickupAddress: 'Abuja Central Business District',
serviceType: 'installation',
},
]);


console.log(' Seed complete');
process.exit(0);
} catch (e) {
console.error(e);
process.exit(1);
}
})();