const express = require('express');
const cartController = require('../controllers/cart.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', cartController.getCart);
router.post('/items', cartController.addOrUpdateItem);
router.post('/sync', cartController.syncCart);
router.delete('/items/:itemId', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;
