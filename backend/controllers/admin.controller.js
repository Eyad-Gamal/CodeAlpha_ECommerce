const asyncHandler = require('../utils/asyncHandler');
const { updateOrderStatusSchema } = require('../validators/order.validator');
const orderService = require('../services/order.service');
const ApiError = require('../utils/ApiError');

const getDashboardStats = asyncHandler(async (_req, res) => {
  const stats = orderService.getAdminDashboardStats();

  res.status(200).json({
    success: true,
    data: stats,
  });
});

const getAllOrders = asyncHandler(async (req, res) => {
  const orders = orderService.listAllOrdersForAdmin(req.query);

  res.status(200).json({
    success: true,
    data: {
      orders,
    },
  });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  // Support both { order_status } and { status } for convenience
  const body = { ...req.body };
  if (body.status && !body.order_status) {
    body.order_status = body.status;
  }

  const validated = updateOrderStatusSchema.parse(body);
  if (!validated.order_status && !validated.payment_status) {
    throw ApiError.badRequest('Provide order_status or payment_status to update');
  }

  const order = orderService.updateOrderStatusByAdmin(req.params.id, validated);

  res.status(200).json({
    success: true,
    message: `Order ${order.order_number} status updated to "${order.order_status}"`,
    data: {
      order,
    },
  });
});

module.exports = {
  getDashboardStats,
  getAllOrders,
  updateOrderStatus,
};
