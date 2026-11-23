const asyncHandler = require('../utils/asyncHandler');
const { cartItemSchema, cartSyncSchema } = require('../validators/order.validator');
const cartService = require('../services/cart.service');

const getCart = asyncHandler(async (req, res) => {
  const cart = cartService.getCart(req.user.id);

  res.status(200).json({
    success: true,
    data: {
      cart,
    },
  });
});

const addOrUpdateItem = asyncHandler(async (req, res) => {
  const validated = cartItemSchema.parse(req.body);
  const mode = req.body.mode === 'increment' ? 'increment' : 'set';
  const cart = cartService.upsertCartItem(req.user.id, {
    productId: validated.productId,
    quantity: validated.quantity,
    mode,
  });

  res.status(200).json({
    success: true,
    message: 'Cart updated',
    data: {
      cart,
    },
  });
});

const syncCart = asyncHandler(async (req, res) => {
  const validated = cartSyncSchema.parse(req.body);
  const cart = cartService.syncGuestCart(req.user.id, validated.items);

  res.status(200).json({
    success: true,
    message: 'Guest cart synchronized with your account',
    data: {
      cart,
    },
  });
});

const removeItem = asyncHandler(async (req, res) => {
  const cart = cartService.removeCartItem(req.user.id, req.params.itemId);

  res.status(200).json({
    success: true,
    message: 'Item removed from cart',
    data: {
      cart,
    },
  });
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = cartService.clearCart(req.user.id);

  res.status(200).json({
    success: true,
    message: 'Cart emptied',
    data: {
      cart,
    },
  });
});

module.exports = {
  getCart,
  addOrUpdateItem,
  syncCart,
  removeItem,
  clearCart,
};
