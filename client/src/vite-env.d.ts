/// <reference types="vite/client" />

declare module '*.module.css?inline' {
    const css: string
    export default css
}
