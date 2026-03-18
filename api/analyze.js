import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { events, date } = req.body;

        // 1. Get Gemini API Key from Supabase
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL || 'https://wvkiqgcpccjcmafjhwzu.supabase.co',
            process.env.VITE_SUPABASE_ANON_KEY || ''
        );

        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'gemini_api_key')
            .single();

        if (error || !data) {
            console.error('Supabase API Key fetch error:', error);
            return res.status(400).json({ error: 'Gemini API Key not found in Supabase. Please configure it in the Admin panel.' });
        }

        const geminiApiKey = data.value;

        // 2. Initialize Gemini
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 3. Prepare Prompt
        const prompt = `
      Eres un asistente experto en gestión clínica para "440 Clinic".
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
      - Si hay conflictos, menciónalos brevemente.
    `;

        // 4. Generate Content
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // 5. Save to Supabase History
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
