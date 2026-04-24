require('dotenv').config();
const express = require('express');
const cors = require('cors');

const safetyRoutes = require('./routes/safety');
const top10Routes = require('./routes/top10');
const mapRoutes = require('./routes/map');
const customWeightsRoutes = require('./routes/customWeights');
const trendsRoutes = require('./routes/trends');
const alertsRoutes = require('./routes/alerts');

require('./cron/weeklyUpdate');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/safety', safetyRoutes);
app.use('/api/top10', top10Routes);
app.use('/api/map', mapRoutes);
app.use('/api/custom-weights', customWeightsRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/api/alerts', alertsRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
