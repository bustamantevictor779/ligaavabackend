const pool = require('../config/database');

exports.updateNextRoundMatches = async (client, finishedMatchId) => {
    // 1. Obtener el partido finalizado y su ganador
    const matchRes = await client.query('SELECT * FROM partidos WHERE id = $1', [finishedMatchId]);
    const match = matchRes.rows[0];
    
    if (match.estado !== 'finalizado') return;

    let winnerId = null;
    // Lógica simple: quien tenga más sets o puntos gana
    if (match.resultado_equipo_a > match.resultado_equipo_b) winnerId = match.equipo_a_id;
    else if (match.resultado_equipo_b > match.resultado_equipo_a) winnerId = match.equipo_b_id;

    if (!winnerId) return; // Empate o error

    // 2. Buscar partidos futuros que esperen al ganador de este partido como "Equipo A"
    await client.query(`
        UPDATE partidos 
        SET equipo_a_id = $1, equipo_a_placeholder_desc = NULL
        WHERE equipo_a_source_partido_id = $2
    `, [winnerId, finishedMatchId]);

    // 3. Buscar partidos futuros que esperen al ganador de este partido como "Equipo B"
    await client.query(`
        UPDATE partidos 
        SET equipo_b_id = $1, equipo_b_placeholder_desc = NULL
        WHERE equipo_b_source_partido_id = $2
    `, [winnerId, finishedMatchId]);
    
    console.log(`[BRACKET] Ganador del partido ${finishedMatchId} (Equipo ${winnerId}) propagado a siguientes rondas.`);
};
