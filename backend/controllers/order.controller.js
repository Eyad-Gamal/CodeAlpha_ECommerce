const asyncHandler = require('../utils/asyncHandler');
const { checkoutSchema } = require('../validators/order.validator');
const orderService = require('../services/order.service');

const checkout = asyncHandler(async (req, res) => {
  const validated = checkoutSchema.parse(req.body);
  const order = orderService.checkoutOrder(req.user.id, validated);

  res.status(201).json({
    success: true,
    message: `Order ${order.order_number} placed successfully`,
    data: {
      order,
    },
  });
});

const getMyOrders = asyncHandler(async (req, res) => {
  const orders = orderService.getCustomerOrders(req.user.id);

  res.status(200).json({
    success: true,
    data: {
      orders,
    },
  });
});

const getOrderById = asyncHandler(async (req, res) => {
  const order = orderService.getOrderById(req.params.id, req.user);

  res.status(200).json({
    success: true,
    data: {
      order,
    },
  });
});

const cancelMyOrder = asyncHandler(async (req, res) => {
  const order = orderService.cancelCustomerOrder(req.params.id, req.user.id);

  res.status(200).json({
    success: true,
    message: 'Order cancelled and inventory restored',
    data: {
      order,
    },
  });
});

module.exports = {
  checkout,
  getMyOrders,
  getOrderById,
  cancelMyOrder,
};
