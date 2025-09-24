import { Router } from 'express';
import Driver from '../models/Driver.js';
import { expectNumber, requireFields } from '../lib/validate.js';

const router = Router();

// CREATE driver  — POST /api/drivers
router.post('/', async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'phone', 'city']);
    const payload = {
      name: req.body.name,
      phone: req.body.phone,
      city: req.body.city,
      rating: typeof req.body.rating === 'number' ? req.body.rating : 5,
      earningsSplit: typeof req.body.earningsSplit === 'number' ? req.body.earningsSplit : 0.7,
      available: !!req.body.available,
      documents: req.body.documents || undefined,
    };
    const created = await Driver.create(payload);
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// LIST  — GET /api/drivers?available=true
router.get('/', async (req, res, next) => {
  try {
    const q = {};
    if (req.query.available === 'true') q.available = true;
    const drivers = await Driver.find(q).lean();
    res.json(drivers);
  } catch (e) { next(e); }
});

// PATCH availability/docs — PATCH /api/drivers/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const update = {};
    if (typeof req.body.available === 'boolean') update.available = req.body.available;
    if (req.body.documents) update.documents = req.body.documents;
    if (typeof req.body.earningsSplit === 'number') update.earningsSplit = req.body.earningsSplit;
    if (typeof req.body.rating === 'number') update.rating = req.body.rating;

    const driver = await Driver.findByIdAndUpdate(id, update, { new: true });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    res.json(driver);
  } catch (e) { next(e); }
});

// UPDATE location — PATCH /api/drivers/:id/location  { lat, lng }
router.patch('/:id/location', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { lat, lng } = req.body;
    expectNumber(lat, 'lat'); expectNumber(lng, 'lng');
    const driver = await Driver.findByIdAndUpdate(
      id, { lat, lng, lastSeenAt: new Date() }, { new: true }
    );
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    res.json(driver);
  } catch (e) { next(e); }

});



// POST /api/drivers
router.post("/", async (req,res,next)=>{
  try{
    const { name, phone, city, earningsSplit, rating, available } = req.body;
    if (!name || !phone) return res.status(400).json({ message: "name and phone required" });
    const created = await Driver.create({
      name, phone, city: city || "", rating: typeof rating==="number"?rating:5,
      earningsSplit: typeof earningsSplit==="number" ? earningsSplit : 0.7,
      available: available !== false
    });
    res.status(201).json(created);
  }catch(e){ next(e); }
});

// DELETE /api/drivers/:id
router.delete("/:id", async (req,res,next)=>{
  try{
    const out = await Driver.findByIdAndDelete(req.params.id);
    if (!out) return res.status(404).json({ message: "Driver not found" });
    res.json({ ok:true });
  }catch(e){ next(e); }
});

export default router;
