# diffuji

A diffusion-powered instant camera built at TreeHacks 2026.

A Raspberry Pi Zero 2W with a camera and thermal receipt printer lives inside a custom housing. Snap a photo, pick a mode, and the image gets sent to an AI backend that transforms it -- then prints the result on receipt paper.

## Modes

**Filter modes** use diffusion models to restyle photos:
- Studio Ghibli style
- Time-travel to past decades
- Turn everyone into ducks
- Give everyone swole muscles

**Search modes** use Perplexity web search to analyze what the camera sees:
- Estimate price of visible items
- Identify objects and landmarks

Each request is routed to one of four AI providers:
1. OpenAI (GPT Image 1.5)
2. Gemini (2.5 Flash Image)
3. Modal (Flux Kontext on H100)
4. Perplexity (Sonar Pro web search)

## Running locally

This is a static site with no build step. Serve it with any static file server:

```sh
npx serve .
```

Then open the URL it prints (usually `http://localhost:3000`).

## Team

- [Nathan Barry](https://nathan.rs)
- [Alex Kranias](https://alexkranias.com)
- [Pranav Tadepalli](https://pranav.cc/)
- [Lainey Leslie](https://laineylabs.com/)
