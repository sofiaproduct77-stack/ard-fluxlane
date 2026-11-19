const express = require('express');
const router = express.Router();
const { News } = require('../models');

router.get('/', async (req, res) => {
    try {
        const { q: query } = req.query;

        if (!query || query.trim().length < 2) {
            return res.json({ results: [], total: 0 });
        }

        const searchTerm = query.trim().toLowerCase();
        const results = [];
        const { Op } = require('sequelize');

        const news = await News.findAll({
            where: {
                isPublished: true,
                [Op.or]: [
                    { title: { [Op.like]: `%${searchTerm}%` } },
                    { content: { [Op.like]: `%${searchTerm}%` } },
                    { excerpt: { [Op.like]: `%${searchTerm}%` } }
                ]
            },
            limit: 10,
            order: [['publishedAt', 'DESC']]
        });

        news.forEach(item => {
            results.push({
                type: 'news',
                title: item.title,
                description: item.excerpt || (item.content || '').substring(0, 150) + '...',
                url: `news-detail.html?id=${item.id}`,
                date: item.publishedAt || item.createdAt,
                category: 'Новости'
            });
        });

        results.sort((a, b) => getRelevanceScore(b, searchTerm) - getRelevanceScore(a, searchTerm));

        res.json({
            results,
            total: results.length,
            query: searchTerm
        });
    } catch (error) {
        console.error('Ошибка поиска:', error);
        res.status(500).json({ error: 'Ошибка поиска' });
    }
});

function getRelevanceScore(item, searchTerm) {
    let score = 0;
    const title = (item.title || '').toLowerCase();
    const description = (item.description || '').toLowerCase();

    if (title.includes(searchTerm)) score += 10;
    if (title.startsWith(searchTerm)) score += 5;
    if (description.includes(searchTerm)) score += 3;

    const searchWords = searchTerm.split(' ');
    searchWords.forEach(word => {
        if (title.includes(word)) score += 2;
        if (description.includes(word)) score += 1;
    });

    return score;
}

module.exports = router;
