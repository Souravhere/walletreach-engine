const express = require('express');
const router = express.Router();
const { authenticate, requireOperator } = require('../middleware/auth');
const {
    createCampaign,
    getCampaigns,
    getCampaignById,
    simulateCampaign,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    stopCampaign,
    deleteCampaign,
    uploadWalletCSV,
    restartCampaign,
} = require('../controllers/campaignController');

// All routes require operator authentication
router.use(authenticate);
router.use(requireOperator);

router.post('/', createCampaign);
router.get('/', getCampaigns);
router.get('/:id', getCampaignById);
router.post('/simulate', simulateCampaign);
router.post('/upload-csv', uploadWalletCSV);
router.post('/:id/start', startCampaign);
router.post('/:id/pause', pauseCampaign);
router.post('/:id/resume', resumeCampaign);
router.post('/:id/stop', stopCampaign);
router.post('/:id/restart', restartCampaign);
router.delete('/:id', deleteCampaign);

module.exports = router;
