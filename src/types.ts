/**
 * Types for Linguist AI
 */

export type ProficiencyLevel = 
  | 'Beginner' 
  | 'Elementary' 
  | 'Low-Pre-Intermediate' 
  | 'Mid-Pre-Intermediate' 
  | 'High-Pre-Intermediate' 
  | 'Low-Intermediate' 
  | 'Mid-Intermediate' 
  | 'High-Intermediate' 
  | 'Low-Upper-Intermediate' 
  | 'High-Upper-Intermediate' 
  | 'Advanced' 
  | 'Proficient';

export interface UserAssessment {
  goals: string[];
  interests: string[];
  currentLevel: ProficiencyLevel;
  numericLevel: number; // 1.0 to 6.0 (A1 to C2)
  targetIELTSScore?: number;
  weaknesses: string[];
  strengths: string[];
  preferredTopics: string[];
  neuralIntensity: number; // 0.5 to 1.5
}

export interface LearningTask {
  id: string;
  type: 'speaking' | 'listening' | 'grammar' | 'vocabulary' | 'writing' | 'reading' | 'quiz';
  title: string;
  description: string;
  topic: string;
  difficulty: ProficiencyLevel;
  estimatedTime: number; // in minutes
  completed: boolean;
  content: any; // Dynamic content based on type
  isTest?: boolean;
}

export interface WeeklyPlan {
  monthTitle: string;
  focus: string;
  tasks: LearningTask[];
  aiAdvice: string;
  lastGenerated: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  dateEarned?: string;
  isUnlocked: boolean;
}

export type AppMode = 'learning' | 'communication';

export interface CommunicationScenario {
  id: string;
  type: 'voice' | 'text';
  situation: string;
  description: string;
  goal: string;
  difficulty: ProficiencyLevel;
  roleAI: string;
  roleUser: string;
}

export interface AppState {
  onboardingComplete: boolean;
  mode: AppMode;
  communicationScenarios: CommunicationScenario[];
  assessment: UserAssessment | null;
  weeklyPlan: WeeklyPlan | null;
  estimatedIELTSBand: number;
  activeFilter: 'all' | 'speaking' | 'writing' | 'reading' | 'vocabulary' | 'grammar' | 'listening' | 'glossary' | 'quiz';
  activeTaskId: string | null;
  sessionUserInput: string;
  sessionQuizAnswers: Record<string, string>; // questionIdx -> selectedOption
  sessionUnknownWords: Record<string, string>; // word -> translation
  dictionary: Record<string, string>; // Global word -> translation store
  streak: {
    count: number;
    lastLoginDate: string;
    best: number;
  };
  achievements: Achievement[];
  masteryScores: {
    speaking: number;
    writing: number;
    listening: number;
    reading: number;
    grammar: number;
    vocabulary: number;
  };
  history: {
    taskId: string;
    score: number;
    feedback: string;
    date: string;
    taskType: LearningTask['type'];
  }[];
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
