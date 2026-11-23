const asyncHandler = require('../utils/asyncHandler');
const {
  productCreateSchema,
  productUpdateSchema,
  reviewSchema,
} = require('../validators/product.validator');
const productService = require('../services/product.service');

const getProducts = asyncHandler(async (req, res) => {
  const result = productService.listProducts(req.query);

  res.status(200).json({
    success: true,
    data: {
      products: result.products,
      pagination: result.pagination,
    },
    meta: result.pagination,
  });
});

const getProductBySlug = asyncHandler(async (req, res) => {
  const product = productService.getProductBySlugOrId(req.params.slug);

  res.status(200).json({
    success: true,
    data: {
      product,
    },
  });
});

const createProduct = asyncHandler(async (req, res) => {
  const validated = productCreateSchema.parse(req.body);
  const product = productService.createProduct(validated, req.uploadedImageUrls || []);

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: {
      product,
    },
  });
});

const updateProduct = asyncHandler(async (req, res) => {
  const validated = productUpdateSchema.parse(req.body);
  const product = productService.updateProduct(
    req.params.id,
    validated,
    req.uploadedImageUrls || []
  );

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: {
      product,
    },
  });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const result = productService.deleteProduct(req.params.id);

  res.status(200).json({
    success: true,
    message: result.message || 'Product deleted successfully',
    data: result,
  });
});

const addReview = asyncHandler(async (req, res) => {
  const validated = reviewSchema.parse(req.body);
  const product = productService.addOrUpdateReview(req.user.id, req.params.id, validated);

  res.status(201).json({
    success: true,
    message: 'Review submitted successfully',
    data: {
      product,
    },
  });
});

module.exports = {
  getProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  addReview,
};
