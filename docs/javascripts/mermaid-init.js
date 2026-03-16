document$.subscribe(() => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
  });
  mermaid.run({
    querySelector: ".mermaid",
  });
});
