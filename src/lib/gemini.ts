import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { UserAssessment, WeeklyPlan, LearningTask, CommunicationScenario } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const generateScenarios = async (assessment: UserAssessment): Promise<CommunicationScenario[]> => {
  const prompt = `You are a Psychological Linguist and Situational Training Expert.
    Generate 6 distinct "Communication Scenarios" for high-stakes linguistic activation.
    
    Student Profile:
    - Level: ${assessment.currentLevel}
    - Goals: ${assessment.goals.join(', ')}
    - Interests: ${assessment.interests.join(', ')}
    
    Requirement:
    - 3 "Voice" scenarios (high focus on speaking/mic involvement).
    - 3 "Text" scenarios (focus on writing/chat).
    - Scenarios must include: a conflict (e.g., late delivery, salary negotiation, misunderstood instruction), a social challenge, or a complex professional situation.
    - Difficulty: ${assessment.currentLevel}.
    
    JSON Output Schema: Array of CommunicationScenario objects.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "type", "situation", "description", "goal", "difficulty", "roleAI", "roleUser"],
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "voice or text" },
              situation: { type: Type.STRING, description: "Brief title (e.g., The Office Conflict)" },
              description: { type: Type.STRING, description: "Detailed situation setup in English" },
              goal: { type: Type.STRING, description: "What the user needs to achieve in the conversation" },
              difficulty: { type: Type.STRING },
              roleAI: { type: Type.STRING, description: "The persona the AI will play" },
              roleUser: { type: Type.STRING, description: "The persona/perspective the user should adopt" }
            }
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Scenario Generation Error:", error);
    return [
      {
        id: 'fallback-1',
        type: 'text',
        situation: 'Airport Lost Luggage',
        description: 'Your suitcase is missing at London Heathrow. The staff seems unhelpful.',
        goal: 'Convince the staff to track it immediately and get a reference number.',
        difficulty: assessment.currentLevel,
        roleAI: 'Busy Airport Clerk',
        roleUser: 'Tired Passenger'
      }
    ];
  }
};

export const generateLearningPlan = async (assessment: UserAssessment): Promise<WeeklyPlan> => {
  const prompt = `You are the World's Leading Applied Linguist and IELTS Examiner. 
    Design a scientifically optimized 30-day "English Mastery & IELTS Success" curriculum for this student.
    
    Current Baseline: ${assessment.currentLevel} (numeric scale: ${assessment.numericLevel || 'N/A'}/6.0)
    Neural Intensity: ${assessment.neuralIntensity} (1.0 is standard, 0.5 is simplified, 1.5 is advanced/academic)
    Interests: ${assessment.interests.join(', ')}
    Goals: ${assessment.goals.join(', ')}
    Weaknesses: ${assessment.weaknesses.join(', ')}

    Requirement: 
    - CRITICAL: You MUST provide EXACTLY 12 bite-sized lessons.
    - These 12 lessons represent the first 4 days of the curriculum (3 distinct lessons per day: 1. Grammar Focus, 2. Lexical/Vocab Focus, 3. Reading/Synthesis).
    - Session Time: Each micro-lesson must be optimized for exactly 3-5 minutes.
    - Level Mandate: Content MUST be strictly calibrated to their proficiency level (${assessment.currentLevel} - exact score: ${assessment.numericLevel || '3.0'}).
    - Tailor content to their specific interests: ${assessment.interests.join(', ')}.
    - SCIENTIFIC MANDATE: Apply "Interleaving". Keep each day's 3 tasks diverse in type.
    - CONTENT RICHNESS: Keep text SHORT (30-60 words) for extreme focus.
    - FOR Lexical Tokens: Always provide Russian translations for each word in vocabularyList.
    - Task Types MUST be one of: speaking, listening, grammar, vocabulary, writing, reading, quiz.
    - MANDATE: ALL tasks MUST have "completed": false.
    
    JSON Output Schema: { monthTitle: string, focus: string, aiAdvice: string, tasks: LearningTask[] }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["monthTitle", "focus", "aiAdvice", "tasks"],
          properties: {
            monthTitle: { type: Type.STRING },
            focus: { type: Type.STRING },
            aiAdvice: { type: Type.STRING },
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "type", "title", "description", "topic", "difficulty", "estimatedTime", "completed", "content"],
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  estimatedTime: { type: Type.INTEGER },
                  completed: { type: Type.BOOLEAN },
                  content: {
                    type: Type.OBJECT,
                    required: ["exercise"],
                    properties: {
                      exercise: { type: Type.STRING },
                      questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                      quizItems: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          required: ["question", "options", "correctAnswer", "explanation"],
                          properties: {
                            question: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            correctAnswer: { type: Type.STRING },
                            explanation: { type: Type.STRING }
                          }
                        }
                      },
                      vocabularyList: { 
                        type: Type.ARRAY, 
                        items: { 
                          type: Type.OBJECT,
                          required: ["word", "translation"],
                          properties: {
                            word: { type: Type.STRING },
                            translation: { type: Type.STRING }
                          }
                        } 
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    const plan = JSON.parse(text);
    
    // Safety Padding: If AI under-produces, fill with intelligent placeholders to reach 12
    if (plan.tasks.length < 12) {
      console.warn(`AI under-produced tasks (${plan.tasks.length}/12). Padding curriculum...`);
      const needed = 12 - plan.tasks.length;
      for (let i = 0; i < needed; i++) {
        plan.tasks.push({
          id: `padded-${Date.now()}-${i}`,
          type: ['grammar', 'vocabulary', 'reading', 'speaking', 'listening', 'quiz'][i % 6] as any,
          title: `Reinforcement Module ${i + 1}`,
          description: `Strategic practice focusing on ${assessment.goals[0] || 'English mastery'}.`,
          topic: assessment.interests[0] || 'Global Systems',
          difficulty: assessment.currentLevel,
          estimatedTime: 5,
          completed: false,
          content: { 
            exercise: `Contextual review of ${assessment.interests.join(', ')} frameworks.`,
            questions: ["How does this apply to your workflow?", "What is the key takeaway?", "Can you summarize in one sentence?"]
          }
        });
      }
    }

    // Force normalized types and completed: false for safety
    plan.tasks = plan.tasks.map((t: any, idx: number) => {
      // Milestone reinforcement tests every 6 tasks (approx every 2 days)
      const isTestDay = (idx + 1) % 6 === 0; 
      return {
        ...t,
        type: (t.type || 'grammar').toLowerCase().trim(),
        completed: false,
        isTest: t.isTest || isTestDay,
        title: isTestDay ? `[MILESTONE TEST] ${t.title || 'Knowledge Check'}` : (t.title || `Cognitive Phase ${idx + 1}`)
      };
    });

    return {
      ...plan,
      lastGenerated: new Date().toISOString()
    };
  } catch (error) {
    console.error("AI Generation Error:", error);
    return {
      monthTitle: "Emergency Mastery Plan",
      focus: "Core Language Recovery",
      aiAdvice: "I've deployed a scientific baseline plan while my neural processors re-calibrate.",
      lastGenerated: new Date().toISOString(),
      tasks: Array.from({ length: 12 }).map((_, idx) => ({
        id: `sc-${idx}`,
        type: ['vocabulary', 'grammar', 'reading', 'speaking', 'listening', 'writing', 'quiz'][idx % 7] as any,
        title: `Foundation Recall ${idx + 1}`,
        description: 'Spaced repetition of core vocabulary related to your goals.',
        topic: 'System Core',
        difficulty: assessment.currentLevel,
        estimatedTime: 5 + (idx % 3) * 5,
        completed: false,
        content: { 
          exercise: "Review the terms: " + (assessment.interests || []).join(', '),
          questions: ["How do these terms relate to your career?", "Which one is most vital?", "Can you define them clearly?"],
          vocabularyList: (assessment.interests || []).map(i => ({ word: i, translation: '...' }))
        }
      }))
    };
  }
};

export const generateReplacementTask = async (assessment: UserAssessment, existingTasks: LearningTask[]): Promise<LearningTask> => {
  const prompt = `You are a Psychological Linguist.
    Generate ONE NEW byte-sized English lesson (3-5 mins) to REPLACE a completed one.
    
    Student level: ${assessment.currentLevel}
    Interests: ${assessment.interests.join(', ')}
    
    Avoid these topics/titles (already completed):
    ${existingTasks.map(t => t.title).join(', ')}
    
    JSON Output Schema: A single LearningTask object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["id", "type", "title", "description", "topic", "difficulty", "estimatedTime", "completed", "content"],
          properties: {
            id: { type: Type.STRING },
            type: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            topic: { type: Type.STRING },
            difficulty: { type: Type.STRING },
            estimatedTime: { type: Type.INTEGER },
            completed: { type: Type.BOOLEAN },
            content: {
              type: Type.OBJECT,
              required: ["exercise"],
              properties: {
                exercise: { type: Type.STRING },
                questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                vocabularyList: { 
                  type: Type.ARRAY, 
                  items: { 
                    type: Type.OBJECT,
                    required: ["word", "translation"],
                    properties: {
                      word: { type: Type.STRING },
                      translation: { type: Type.STRING }
                    }
                  } 
                }
              }
            }
          }
        }
      }
    });

    const task = JSON.parse(response.text);
    return { ...task, completed: false, id: `replacement-${Date.now()}` };
  } catch (error) {
    console.error("Replacement Task Error:", error);
    return {
      id: `fallback-${Date.now()}`,
      type: 'vocabulary',
      title: 'Neural Reinforcement',
      description: 'Reviewing key concepts.',
      topic: 'General',
      difficulty: assessment.currentLevel,
      estimatedTime: 5,
      completed: false,
      content: { exercise: "Review your recent lessons and identify one new word you learned.", questions: ["How will you use this word?"] }
    };
  }
};

export const getExerciseFeedback = async (task: LearningTask, userResponse: string): Promise<{ score: number; feedback: string }> => {
  const prompt = `You are a High-Level Linguistic Evaluator and IELTS Examiner.
    Evaluate the user's response for the following English learning task:
    
    Task Level: ${task.difficulty}
    Task Type: ${task.type}
    Task Title: ${task.title}
    Task Content/Exercise: ${task.content?.exercise || 'N/A'}
    Reference Questions/Prompt: ${task.content?.questions?.join(' | ') || 'N/A'}
    
    User submitted Response: "${userResponse}"
    
    Scientific Evaluation Criteria:
    1. Relevance: Did the user actually address the task content and questions?
    2. Grammar & Syntax: Are there structural errors?
    3. Vocabulary Density: Is the word choice appropriate for the ${task.difficulty} level?
    4. Coherence: Does the response make logical sense in the context of the exercise?
    
    Provide:
    - score: Integer 0-100. Be strict. 0-40 is poor/irrelevant, 40-70 is developing, 70-90 is strong, 90-100 is mastery.
    - feedback: Deeply analytical feedback in Russian. Mention specifically what was good, highlight exact errors, provide CORRECT versions or more natural-sounding alternatives for the user's mistakes. Use a professional, highly informative, yet encouraging tone.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["score", "feedback"],
        properties: {
          score: { type: Type.INTEGER },
          feedback: { type: Type.STRING }
        }
      }
    }
  });

  return JSON.parse(response.text);
};

export const getTutorResponse = async (history: { role: 'user' | 'assistant', content: string }[]): Promise<string> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: "You are a friendly, encouraging personal English tutor. Help the user with their English learning journey. Be concise but helpful."
    }
  });
  return response.text || "I'm sorry, I couldn't generate a response.";
};

export const getTaskAudio = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Read clearly: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"] as any,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Charon' },
          },
        },
      },
    });

    const base64Audio = (response as any).candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

export const getWordTranslation = async (word: string, context: string): Promise<string> => {
  const prompt = `Translate the English word "${word}" into Russian. 
  Context: "${context}"
  Provide ONLY the Russian translation, no extra text.`;
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    }
  });
  
  return response.text || "Перевод не найден";
};
