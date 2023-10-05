import { env } from "$env/dynamic/private";
import { getTokens } from "$lib/tokenizer";
import { json } from "@sveltejs/kit";
import type { ChatCompletionCreateParams, ChatCompletionMessage } from "openai/resources/chat";
import type { ModerationCreateResponse } from "openai/resources/moderations";

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    try {
        if (!env.OPENAI_KEY) throw new Error("OPENAI_KEY env variable is not set");

        const requestData = await request.json();

        if (!requestData) throw new Error("No request data provided");

        const reqMessages: ChatCompletionMessage[] = requestData.messages;

        if (!reqMessages) throw new Error("No messages provided");

        let tokenCount = 0;
        reqMessages.forEach(message => {
            const tokens = getTokens(message.content || "");
            tokenCount += tokens;
        });

        const moderationResponse = await fetch('https://api.openai.com/v1/moderations', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.OPENAI_KEY}`
            },
            method: 'POST',
            body: JSON.stringify({
                input: reqMessages[reqMessages.length - 1].content,
            })
        });

        if (!moderationResponse.ok) {
            const err = await moderationResponse.json();
            throw new Error(err);
        }

        const moderationData: ModerationCreateResponse = await moderationResponse.json();
        const [result] = moderationData.results;

        if (result.flagged) throw new Error("Message was flagged by OpenAI's content moderation model");

        const prompt = 'You are a virtual assistant for a company called Four Leaves Studio. Your name is Tigaron Noragit';
        tokenCount += getTokens(prompt);

        if (tokenCount >= 4000) throw new Error("Query is too large");

        const messages: ChatCompletionMessage[] = [
            { role: 'system', content: prompt },
            ...reqMessages
        ];

        const chatRequestOpts: ChatCompletionCreateParams = {
            model: 'gpt-3.5-turbo',
            messages,
            temperature: 0.9,
            stream: true,
        };

        const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.OPENAI_KEY}`
            },
            method: 'POST',
            body: JSON.stringify(chatRequestOpts)
        })

        if (!chatResponse.ok) {
            const err = await chatResponse.json();
            throw new Error(err);
        }

        return new Response(chatResponse.body, {
            headers: {
                'Content-Type': 'text/event-stream'
            }
        })
    } catch (error) {
        console.error(error);
        return json({ error: 'There was an error processing your request' }, { status: 500 })
    }
};