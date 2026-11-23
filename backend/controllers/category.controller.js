const asyncHandler = require('../utils/asyncHandler');
const { categorySchema } = require('../validators/product.validator');
const productService = require('../services/product.service');

const getCategories = asyncHandler(async (req, res) => {
  const includeInactive = req.user?.role === 'admin' && req.query.all === 'true';
  const categories = productService.listCategories({ includeInactive });

  res.status(200).json({
    success: true,
    data: {
      categories,
    },
  });
});

const createCategory = asyncHandler(async (req, res) => {
  const validated = categorySchema.parse(req.body);
  const category = productService.createCategory(validated);

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: {
      category,
    },
  });
});

const updateCategory = asyncHandler(async (req, res) => {
  const validated = categorySchema.partial().parse(req.body);
  const category = productService.updateCategory(req.params.id, validated);

  res.status(200).json({
    success: true,
    message: 'Category updated successfully',
    data: {
      category,
    },
  });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const result = productService.deleteCategory(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Category deleted successfully',
    data: result,
  });
});

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
