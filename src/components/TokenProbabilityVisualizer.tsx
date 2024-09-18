import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { z } from "zod";

const TopLogProbSchema = z.object({
  token: z.string(),
  logprob: z.number(),
  bytes: z.array(z.number()).nullable(),
});

const LogProbContentSchema = z.object({
  token: z.string(),
  logprob: z.number(),
  bytes: z.array(z.number()),
  top_logprobs: z.array(TopLogProbSchema),
});

const MessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

const ChoiceSchema = z.object({
  index: z.number(),
  message: MessageSchema,
  logprobs: z.object({
    content: z.array(LogProbContentSchema),
  }),
  finish_reason: z.string(),
});

const UsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

const ChatCompletionSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChoiceSchema),
  usage: UsageSchema,
  system_fingerprint: z.null(),
});

export type ChatCompletion = z.infer<typeof ChatCompletionSchema>;

const TokenProbabilityVisualizer = () => {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [apiKey, setApiKey] = useState('');
  const [topTokens, setTopTokens] = useState(5);
  const [completion, setCompletion] = useState<ChatCompletion | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCompletion = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: temperature,
          logprobs: true,
          top_logprobs: topTokens
        })
      });

      const data = await response.json();
      const completion = ChatCompletionSchema.safeParse(data);
      if (completion.success) {
        setCompletion(completion.data);
      } else {
        console.error('Error parsing completion: ', completion.error.errors);
      }
    } catch (error) {
      console.error('Error fetching completion:', error);
    }
    setLoading(false);
  };

  const renderTokenColumns = () => {
    return completion?.choices[0].logprobs.content.map((token, index) => (
      <div key={index} className="flex flex-col items-center mb-4">
        <div className="font-bold mb-2">{token.token}</div>
        {token.top_logprobs.map(({token: alternativeToken, logprob}, i) => (
          <div
            key={i}
            className={`p-2 ${
              alternativeToken === token.token ? 'bg-blue-200' : 'bg-gray-100'
            } rounded mb-1 text-sm`}
          >
            {alternativeToken}: {(Math.exp(logprob)*100).toFixed(3)}%
          </div>
        ))}
      </div>
    ));
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Token Probability Visualizer</h1>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Input
          placeholder="System Prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
        <Input
          placeholder="User Prompt"
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className="block mb-2">Temperature: {temperature}</label>
        <Slider
          min={0}
          max={1}
          step={0.1}
          value={[temperature]}
          onValueChange={(value) => setTemperature(value[0])}
        />
      </div>
      <div className="mb-4">
        <label className="block mb-2">Top Tokens: {topTokens}</label>
        <Slider
          min={1}
          max={10}
          step={1}
          value={[topTokens]}
          onValueChange={(value) => setTopTokens(value[0])}
        />
      </div>
      <Input
        type="password"
        placeholder="OpenAI API Key"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="mb-4"
      />
      <Button onClick={fetchCompletion} disabled={loading}>
        {loading ? 'Loading...' : 'Generate Completion'}
      </Button>
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Token Probabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">{renderTokenColumns()}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TokenProbabilityVisualizer;