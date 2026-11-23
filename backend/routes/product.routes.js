const express = require('express');
const productController = require('../controllers/product.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { uploadMemory, processProductUploads } = require('../middlewares/upload.middleware');

const router = express.Router();

router.get('/', productController.getProducts);
router.get('/:slug', productController.getProductBySlug);

router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  uploadMemory.array('imageFiles', 5),
  processProductUploads,
  productController.createProduct
);

router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  uploadMemory.array('imageFiles', 5),
  processProductUploads,
  productController.updateProduct
);

router.delete('/:id', requireAuth, requireRole('admin'), productController.deleteProduct);

router.post('/:id/reviews', requireAuth, productController.addReview);

module.exports = router;
