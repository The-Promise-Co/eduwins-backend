import express from 'express';
import { getStates, getLgas } from '../controllers/locationController';

const router = express.Router();

router.get('/states', getStates as any);
router.get('/lgas', getLgas as any);

export default router;
