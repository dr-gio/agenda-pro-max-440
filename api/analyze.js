import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { events, date } = req.body;

        // 1. Use Anthropic API key from environment
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
            return res.status(400).json({ error: 'ANTHROPIC_API_KEY no configurada en variables de entorno.' });
        }

        // 2. Initialize Supabase
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.VITE_SUPABASE_ANON_KEY
        );

        // 3. Initialize Claude
        const anthropic = new Anthropic({ apiKey: anthropicApiKey });

        // 4. Prepare Prompt
        const prompt = `Eres un asistente experto en gestión clínica para "440 Clinic".
Tu tarea es analizar la agenda del día (${date}) y detectar:
1. Conflictos de programación (mismo paciente/doctor en dos lugares a la vez).
2. Huecos de tiempo infrautilizados.
3. Recomendaciones rápidas para mejorar el flujo.

DATOS DE LA AGENDA:
${JSON.stringify(events, null, 2)}

INSTRUCCIONES DE SALIDA:
- Responde en ESPAÑOL.
- Sé extremadamente conciso (máximo 150 caracteres para el resumen).
- Si no hay conflictos, di "Flujo optimizado. Sin conflictos detectados."
- Si hay conflictos, menciónalos brevemente.`;

        // 5. Generate Content with Claude
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }]
        });

        const text = message.content[0].text.trim();

        // 6. Save to Supabase History
        const hasConflicts = !text.toLowerCase().includes('sin conflictos');
        try {
            await supabase.from('ai_insights').insert({
                date: date || new Date().toISOString().split('T')[0],
                insight: text,
                has_conflicts: hasConflicts
            });
        } catch (dbError) {
            console.error('Failed to save insight to history:', dbError);
        }

        return res.status(200).json({ insight: text, hasConflicts });
    } catch (error) {
        console.error('AI Analysis Error:', error);
        return res.status(500).json({ error: 'AI Analysis failed', details: error.message });
    }
}
