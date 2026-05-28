import { useState, useEffect } from 'react'

interface TokenOption {
  token: string;
  probability: number;
}

interface TopLogProb {
  token: string;
  logprob: number;
  bytes: number[] | null;
}

interface TokenLogProb {
  token: string;
  logprob: number;
  bytes: number[];
  top_logprobs: TopLogProb[];
}

interface OpenAIChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  logprobs: {
    content: TokenLogProb[];
  };
  finish_reason: string;
}

interface OpenAIError {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string;
  }
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ResponseInspectorProps {
  data: OpenAIResponse | OpenAIError;
}


interface RequestHistoryItem {
  prompt: string;
  response: OpenAIResponse | OpenAIError;
  context: {
    messages: { role: string; content: string; }[];
    model: string;
    temperature: number;
    maxTokens: number;
    topLogprobs: number;
  };
}

const LOCAL_STORAGE_KEY = 'openai_api_key';
const THEME_STORAGE_KEY = 'theme_mode';

type Theme = 'serious' | 'thanksgiving';

const ResponseInspector = ({ data }: ResponseInspectorProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-4 p-4 bg-white rounded-xl shadow-lg">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
      >
        <span className="text-sm font-medium">
          {isExpanded ? 'Hide' : 'Show'} API Response
        </span>
        <svg 
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <pre className="mt-2 p-4 bg-gray-50 rounded overflow-auto text-sm max-h-[400px] scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};

const LoadingSpinner = ({ theme }: { theme: Theme }) => (
  <div className="flex justify-center items-center">
    {theme === 'thanksgiving' ? (
      <div className="animate-bounce text-4xl">🦃</div>
    ) : (
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    )}
  </div>
);

// Add this new component for animated parade tokens
const ParadeToken = ({ token, index }: { token: string; index: number }) => (
  <span 
    className="inline-block translate-x-full animate-slide-in mx-[1px] px-1.5 py-0.5 bg-white border-2 border-amber-200 rounded-md shadow-sm whitespace-pre"
    style={{ 
      animationDelay: `${index * 100}ms`,
    }}
  >
    <span className="relative">
      {token}
      {index % 3 === 0 && (
        <span className="absolute -top-2 left-1/2 transform -translate-x-1/2 text-[8px]">
          {['🍁', '🦃', '🍂'][Math.floor(index % 3)]}
        </span>
      )}
    </span>
  </span>
);

const TokenAnimation = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [constructedSentence, setConstructedSentence] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightedToken, setHighlightedToken] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(() => {
    // Initialize from localStorage if available
    return localStorage.getItem(LOCAL_STORAGE_KEY) || '';
  });
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-3.5-turbo');
  const [tokenData, setTokenData] = useState<TokenOption[][]>([]);
  const [chosenTokens, setChosenTokens] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<OpenAIResponse | OpenAIError | null>(null);

  // Available models
  const models = [
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4o', name: 'GPT-4 Optimized' },
    { id: 'gpt-4o-mini', name: 'GPT-4 Optimized Mini' },
  ];

  // Add new state variables for stepping mode
  const [mode, setMode] = useState<'auto' | 'step'>('auto');
  const [isTokenRevealed, setIsTokenRevealed] = useState(false);

  // Add new state variables for the settings
  const [temperature, setTemperature] = useState(1);
  const [topLogprobs, setTopLogprobs] = useState(10);
  const [maxCompletionTokens, setMaxCompletionTokens] = useState(20);

  // Add new state for configuration expansion
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);

  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'serious' || stored === 'thanksgiving' ? stored : 'thanksgiving';
  });
  const isThanksgiving = theme === 'thanksgiving';
  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  };

  // Add new state for tracking alternative choices
  const [alternativeChoices, setAlternativeChoices] = useState<string[]>([]);
  const [requestHistory, setRequestHistory] = useState<RequestHistoryItem[]>([]);

  // Add thanksgiving-themed prompts
  const thanksgivingPrompts = [
    "Write a heartwarming message about family gatherings",
    "Describe the perfect Thanksgiving feast",
    "Tell me what you're grateful for",
    "Write a funny story about a turkey",
    "Describe the autumn weather on Thanksgiving",
  ];

  const fetchTokenProbabilities = async (prefilledContent?: string) => {
    setIsLoading(true);
    setError(null);
    setRawResponse(null);
    
    try {
      const messages = prefilledContent ? [
        { role: "user", content: prompt },
        { role: "assistant", content: prefilledContent }
      ] : [
        { role: "user", content: prompt }
      ];

      // Store the request context before making the API call
      const requestContext = {
        messages,
        model,
        temperature,
        max_tokens: maxCompletionTokens,
        logprobs: true,
        top_logprobs: topLogprobs
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestContext)
      });

      const data = await response.json();
      setRawResponse(data);
      
      // Add to request history with serializable data
      setRequestHistory(prev => [...prev, {
        prompt: prefilledContent || prompt,
        response: data,
        context: {
          messages: messages.map(m => ({ ...m })), // Create clean copy
          model,
          temperature,
          maxTokens: maxCompletionTokens,
          topLogprobs
        }
      }]);

      if (!response.ok) {
        const apiError = data as OpenAIError;
        throw new Error(
          `${apiError.error.message}\nType: ${apiError.error.type}${
            apiError.error.code ? `\nCode: ${apiError.error.code}` : ''
          }`
        );
      }

      const choice: OpenAIChoice = data.choices[0];

      // Convert logprobs to our token data format
      const newTokenData: TokenOption[][] = choice.logprobs.content.map(logprob => {
        return logprob.top_logprobs.map(topLogprob => ({
          token: topLogprob.token,
          probability: Math.exp(topLogprob.logprob) * 100 // Convert logprob to probability percentage
        })).sort((a, b) => b.probability - a.probability);
      });

      // Update all token-related state
      setTokenData(newTokenData);
      setChosenTokens(choice.logprobs.content.map(logprob => logprob.token));
      
      // If this is a continuation (prefilledContent exists), initialize with previous tokens
      if (prefilledContent) {
        // Instead of splitting into characters, keep the existing constructed sentence
        setConstructedSentence(prev => prev);
      } else {
        setConstructedSentence([]);
      }
      
      setCurrentStep(0);
      setHighlightedToken(null);
      setIsTokenRevealed(false);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Update localStorage when API key changes
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem(LOCAL_STORAGE_KEY, newKey);
  };

  // Modify the useEffect for animation to handle stepping mode
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    
    const advanceAnimation = () => {
      if (mode === 'auto' && isPlaying && currentStep < tokenData.length - 1) {
        // First highlight the chosen token
        setHighlightedToken(chosenTokens[currentStep]);
        
        timeoutId = setTimeout(() => {
          // Add the token to the sentence and clear the highlight in one step
          setConstructedSentence(prev => [...prev, chosenTokens[currentStep]]);
          setHighlightedToken(null);
          setCurrentStep(prev => prev + 1);
        }, 1000);
      }
    };

    if (mode === 'auto') {
      advanceAnimation();
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [currentStep, isPlaying, tokenData.length, chosenTokens, mode]);

  // Add handlers for stepping mode
  const handleNextStep = () => {
    if (!isTokenRevealed) {
      // Just reveal the chosen token
      setIsTokenRevealed(true);
      setHighlightedToken(chosenTokens[currentStep]);
    } else {
      // Add token to sentence and move to next step
      setConstructedSentence(prev => [...prev, chosenTokens[currentStep]]);
      setCurrentStep(prev => prev + 1);
      setHighlightedToken(null);
      setIsTokenRevealed(false);
    }
  };

  const handlePlayPause = () => {
    if (currentStep >= tokenData.length - 1) {
      handleReset();
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleReset = () => {
    // If there's no request history, just reset the state
    if (requestHistory.length === 0) {
      setCurrentStep(0);
      setConstructedSentence([]);
      setHighlightedToken(null);
      setIsTokenRevealed(false);
      setIsPlaying(false);
      return;
    }

    // Get the first request from history
    const firstRequest = requestHistory[0];
    
    // Reset to the first request's state
    if ('choices' in firstRequest.response) {
      const choice = firstRequest.response.choices[0];
      
      // Convert logprobs to token data format
      const tokenData: TokenOption[][] = choice.logprobs.content.map(logprob => {
        return logprob.top_logprobs.map(topLogprob => ({
          token: topLogprob.token,
          probability: Math.exp(topLogprob.logprob) * 100
        })).sort((a, b) => b.probability - a.probability);
      });

      setTokenData(tokenData);
      setChosenTokens(choice.logprobs.content.map(logprob => logprob.token));
      setRawResponse(firstRequest.response);
    }

    // Reset all other state
    setCurrentStep(0);
    setConstructedSentence([]);
    setHighlightedToken(null);
    setIsTokenRevealed(false);
    setIsPlaying(false);
    setAlternativeChoices([]);
    
    // Reset request history to only show the first request
    setRequestHistory([requestHistory[0]]);
  };

  // Add handler for choosing alternative token
  const handleTokenChoice = async (token: string) => {
    if (mode !== 'step' || isTokenRevealed) return;

    // Update the constructed sentence by adding the token as a whole unit
    const newSentence = [...constructedSentence, token];
    setConstructedSentence(newSentence);
    setAlternativeChoices([...alternativeChoices, token]);
    
    // Join the tokens while preserving whitespace
    const fullText = newSentence.reduce((acc, t, i) => {
      // If it's not the first token and the current token doesn't start with whitespace
      // and the previous token doesn't end with whitespace, add a space
      if (i > 0 && !t.startsWith(' ') && !acc.endsWith(' ')) {
        return acc + ' ' + t;
      }
      return acc + t;
    }, '');
    
    await fetchTokenProbabilities(fullText);
  };

  // Update the TokenCard component to make it more interactive in step mode
  const TokenCard = ({ token, probability, isChosen, isHighlighted, rank, isOutsideTopN }: {
    token: string;
    probability: number;
    isChosen: boolean;
    isHighlighted: boolean;
    rank: number;
    isOutsideTopN?: boolean;
  }) => (
    <div
      onClick={() => mode === 'step' && !isTokenRevealed && handleTokenChoice(token)}
      className={`p-2 m-1 rounded-lg transition-all duration-300 flex items-center gap-3 ${
        isHighlighted || isChosen
          ? isThanksgiving
            ? 'bg-orange-100 border-2 border-orange-500 transform scale-105'
            : 'bg-green-100 border-2 border-green-500 transform scale-105'
          : isThanksgiving
            ? 'bg-amber-50 border border-amber-200 hover:border-orange-300'
            : 'bg-gray-50 border border-gray-200 hover:border-blue-300'
      } ${isOutsideTopN ? 'animate-bounce-once' : ''} ${
        mode === 'step' && !isTokenRevealed
          ? isThanksgiving
            ? 'cursor-pointer hover:bg-orange-50 hover:shadow-md transform hover:scale-102 transition-all'
            : 'cursor-pointer hover:bg-blue-50 hover:shadow-md transform hover:scale-102 transition-all'
          : ''
      }`}
    >
      <div className={`font-mono w-8 ${isThanksgiving ? 'text-amber-800' : 'text-gray-500'}`}>
        {isOutsideTopN ? (isThanksgiving ? '🦃' : '★') : `${rank}.`}
      </div>
      <div className="flex-1">
        <div className="font-mono text-base whitespace-pre-wrap break-all">
          {token.split('').map((char, i) =>
            char === ' ' ? <span key={i} className="bg-gray-100">␣</span> : char
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-32 h-2 rounded-full overflow-hidden ${isThanksgiving ? 'bg-amber-200' : 'bg-gray-200'}`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${isThanksgiving ? 'bg-orange-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, probability)}%` }}
            />
          </div>
          <div className={`text-xs min-w-[60px] ${isThanksgiving ? 'text-amber-800' : 'text-gray-600'}`}>{probability.toFixed(2)}%</div>
        </div>
      </div>
    </div>
  );

  // Update the mode change handler to properly reset all state
  const handleModeChange = (newMode: 'auto' | 'step') => {
    setMode(newMode);
    setIsPlaying(false);
    setCurrentStep(0);
    setConstructedSentence([]);
    setHighlightedToken(null);
    setIsTokenRevealed(false);
  };

  // Fix the type error with rawResponse by adding a type guard
  const getTokenProbability = (step: number) => {
    if (rawResponse && 'choices' in rawResponse) {
      return Math.exp(rawResponse.choices[0].logprobs.content[step].logprob) * 100;
    }
    return 0;
  };

  // Fix the button click handler
  const handleGenerateClick = () => {
    fetchTokenProbabilities();
  };

  // Update the RequestHistory component to show more context
  const RequestHistory = () => (
    <div className="mt-4">
      <h3 className="text-lg font-semibold mb-2">Request History</h3>
      {requestHistory.map((request, index) => (
        <div key={index} className="mb-4 p-4 bg-white rounded-xl shadow-lg">
          <div className="mb-2">
            <div className="font-medium">Request #{index + 1}</div>
            <div className="text-sm text-gray-600">
              Model: {request.context.model}, 
              Temperature: {request.context.temperature}, 
              Max Tokens: {request.context.maxTokens}
            </div>
            <div className="font-mono text-sm mt-2">
              {request.context.messages.map((msg, i) => (
                <div key={i} className="mb-1">
                  <span className="font-semibold">{msg.role}:</span> {msg.content}
                </div>
              ))}
            </div>
          </div>
          <ResponseInspector data={request.response} />
        </div>
      ))}
    </div>
  );

  return (
    <div className={`w-full max-w-6xl mx-auto p-4 ${isThanksgiving ? 'bg-gradient-to-b from-amber-50 to-orange-50' : ''}`}>
      {/* Theme toggle */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex bg-gray-100 rounded-lg p-1 shadow-sm">
          <button
            onClick={() => handleThemeChange('serious')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              theme === 'serious' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Serious
          </button>
          <button
            onClick={() => handleThemeChange('thanksgiving')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              theme === 'thanksgiving' ? 'bg-white shadow text-amber-800' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🦃 Thanksgiving
          </button>
        </div>
      </div>

      {/* Configuration section */}
      <div className={`mb-6 p-4 bg-white rounded-xl shadow-lg ${isThanksgiving ? 'border-2 border-orange-200' : ''}`}>
        {isThanksgiving && (
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-amber-800 mb-2">🦃 Token Turkey 🦃</h1>
            <p className="text-amber-700">Watch AI tokens generate like a Thanksgiving parade!</p>
          </div>
        )}

        {isThanksgiving && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-amber-800">Choose a Thanksgiving Prompt</label>
            <select
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-2 border-2 border-amber-200 rounded bg-amber-50"
            >
              {thanksgivingPrompts.map((p, i) => (
                <option key={i} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}

        <div className="md:col-span-2 mb-6">
          <label className="block text-sm font-medium mb-2">Prompt</label>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder={isThanksgiving ? 'Choose a Thanksgiving-themed prompt, or write your own' : 'Enter a prompt'}
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-4 mb-6">
          <button
            onClick={handleGenerateClick}
            disabled={!apiKey || isLoading}
            className={`px-6 py-2 text-white rounded-lg transition-colors disabled:bg-gray-300 ${
              isThanksgiving
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            Generate New Tokens
          </button>
          {isLoading && <LoadingSpinner theme={theme} />}
        </div>

        <button 
          onClick={() => setIsConfigExpanded(!isConfigExpanded)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
        >
          <span className="text-xl font-bold">
            {isConfigExpanded ? 'Hide' : 'Show'} Configuration
          </span>
          <svg 
            className={`w-4 h-4 transition-transform ${isConfigExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isConfigExpanded && (
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  className="w-full p-2 border rounded"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Temperature (0-2)</label>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full p-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Top Logprobs (0-20)</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="1"
                  value={topLogprobs}
                  onChange={(e) => setTopLogprobs(Number(e.target.value))}
                  className="w-full p-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Max Completion Tokens</label>
                <input
                  type="number"
                  min="1"
                  value={maxCompletionTokens}
                  onChange={(e) => setMaxCompletionTokens(Number(e.target.value))}
                  className="w-full p-2 border rounded"
                />
              </div>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-100 text-red-700 rounded whitespace-pre-line">
                {error}
              </div>
            )}
            {rawResponse && <ResponseInspector data={rawResponse} />}
          </div>
        )}
      </div>

      {/* Add request history after the configuration section */}
      {requestHistory.length > 0 && <RequestHistory />}

      {/* Add back the animation display */}
      <div className="flex gap-4">
        {/* Left side: Generated sentence and controls */}
        <div className="w-1/2">
          <div className={`p-4 bg-white rounded-xl shadow-lg mb-4 ${isThanksgiving ? 'border-2 border-orange-200' : ''}`}>
            {isThanksgiving ? (
              <>
                <h2 className="text-xl font-bold mb-2 text-amber-800">🍂 Thanksgiving Token Parade 🦃</h2>
                <div className="relative min-h-[120px] overflow-hidden bg-gradient-to-b from-amber-50/50 to-orange-50/50 rounded-lg p-4">
                  <div className="absolute inset-0 pointer-events-none">
                    {['🍁', '🍂', '🍁', '🍂'].map((leaf, i) => (
                      <span
                        key={i}
                        className="absolute animate-float-leaf"
                        style={{
                          left: `${(i * 20) % 100}%`,
                          animationDelay: `${i * 1.5}s`,
                          fontSize: '12px'
                        }}
                      >
                        {leaf}
                      </span>
                    ))}
                  </div>

                  <div className="absolute bottom-4 left-4 right-4 h-1 bg-gradient-to-r from-amber-200 via-orange-200 to-amber-200 rounded"></div>

                  <p className="text-lg font-mono leading-relaxed relative z-10 py-4 flex flex-wrap gap-1">
                    {constructedSentence.length > 0 ?
                      constructedSentence.map((token, index) => (
                        <ParadeToken key={index} token={token} index={index} />
                      ))
                      :
                      <span className="text-amber-800 animate-bounce inline-block">
                        (The parade is about to begin...🦃)
                      </span>
                    }
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold mb-2">Generated Text:</h2>
                <p className="text-lg font-mono leading-relaxed">
                  {constructedSentence.length > 0
                    ? constructedSentence.join('')
                    : '(Waiting to start...)'}
                </p>
              </>
            )}
          </div>
          <p className="text-gray-600 mb-4">
            Click on a token to continue the story with your choice, 
            or use the "Reveal Model's Choice" button to see what the AI model selected.
          </p>
          <div className="flex gap-4 mb-4">
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as 'auto' | 'step')}
              className={
                isThanksgiving
                  ? 'px-4 py-2 border-2 border-amber-300 rounded-lg bg-amber-50 text-amber-800'
                  : 'px-4 py-2 border rounded-lg'
              }
            >
              <option value="auto">{isThanksgiving ? 'Auto Feast' : 'Auto Play'}</option>
              <option value="step">{isThanksgiving ? 'Step by Step Recipe' : 'Step by Step'}</option>
            </select>

            {mode === 'auto' ? (
              <button
                onClick={handlePlayPause}
                disabled={tokenData.length === 0}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-300"
              >
                {isPlaying ? 'Pause' : currentStep >= tokenData.length - 1 ? 'Restart' : 'Play'}
              </button>
            ) : (
              <button
                onClick={handleNextStep}
                disabled={tokenData.length === 0 || currentStep >= tokenData.length}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-300"
              >
                {!isTokenRevealed ? "Reveal Model's Choice" : 'Continue to Next Token'}
              </button>
            )}

            <button
              onClick={handleReset}
              disabled={tokenData.length === 0}
              className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:bg-gray-300"
            >
              Reset
            </button>
          </div>

          <div className="mt-2 text-sm text-gray-600">
            {tokenData.length === 0 ? 
              'Generate tokens to start' :
              currentStep >= tokenData.length ? 
              'Generation complete! Click Reset to start over.' : 
              `Token ${currentStep + 1} of ${tokenData.length}`
            }
          </div>
        </div>

        {/* Right side: Token options */}
        <div className="w-1/2">
          {currentStep < tokenData.length && (
            <div className={isThanksgiving ? 'p-4 bg-white rounded-xl shadow-lg border-2 border-orange-200' : ''}>
              {mode === 'step' && !isTokenRevealed ? (
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-2">
                    Choose Your Next Token:
                  </h3>
                </div>
              ) : (
                <h3 className="text-lg font-semibold mb-2">
                  Token Options (Step {currentStep + 1}):
                </h3>
              )}

              <div className="flex flex-col gap-1">
                {tokenData[currentStep].map((item, index) => (
                  <TokenCard
                    key={index}
                    token={item.token}
                    probability={item.probability}
                    isChosen={mode === 'auto' ? item.token === chosenTokens[currentStep] : isTokenRevealed && item.token === chosenTokens[currentStep]}
                    isHighlighted={item.token === highlightedToken}
                    rank={index + 1}
                  />
                ))}
                
                {/* Add ellipsis and chosen token only when revealed */}
                {chosenTokens[currentStep] && 
                 !tokenData[currentStep].some(item => item.token === chosenTokens[currentStep]) && 
                 (isTokenRevealed || mode === 'auto') && (
                  <>
                    <div className="text-center text-gray-500 my-2">. . .</div>
                    <TokenCard
                      token={chosenTokens[currentStep]}
                      probability={getTokenProbability(currentStep)}
                      isChosen={isTokenRevealed || mode === 'auto'}
                      isHighlighted={chosenTokens[currentStep] === highlightedToken}
                      rank={tokenData[currentStep].length + 1}
                      isOutsideTopN={true}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {isThanksgiving && (
        <div className="fixed bottom-0 left-0 w-full h-16 flex justify-around items-end pointer-events-none">
          {['🦃', '🍁', '🍽️', '🥧', '🌽'].map((emoji, i) => (
            <div
              key={i}
              className="animate-bounce"
              style={{ animationDelay: `${i * 0.2}s` }}
            >
              {emoji}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TokenAnimation;