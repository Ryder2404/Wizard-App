# Wizard Begleiter – 30 Jahre Jubiläumsedition

Eine Web-App (PWA) als Punkteblock und Regelhilfe für das Kartenspiel **Wizard**.
Sie lässt sich auf dem iPhone über Safari installieren, ohne Mac, Apple-Konto oder App Store.

## Funktionen

- **Punkteblock** für 3–6 Spieler mit automatischer Wertung (20 + 10 pro Stich bzw. −10 pro Stich Abweichung)
- Pro Runde: Kartenzahl, Geber und Startspieler; Eingabe der Ansagen, danach der Stiche
- **Sonderkarten**: Wolke (Ansage ±1) und Bombe (Stich ohne Gewinner) fließen in Wertung und Prüfung ein
- Optionale Regel **„Ansagen dürfen nicht aufgehen“** (der Geber darf die Summe nicht passend machen)
- Prüfung, ob die Summe der Stiche stimmt; „Alle wie angesagt“ als Schnelleingabe
- Trumpf-Anzeige für die laufende Runde
- Tabelle mit Zwischenstand, Korrektur der letzten Runde, Ergebnis mit Podest und Trefferquote
- Verlauf der letzten Spiele, Revanche mit denselben Spielern
- Regelübersicht inkl. aller Sonderkarten (Drache, Fee, Bombe, Wolke, Jongleur, Werwolf, Gestaltwandler, Hexe, Vampir)
- Offline nutzbar, Spielstand bleibt beim Schließen erhalten, Bildschirm bleibt während des Spiels an

## Veröffentlichen (einmalig)

Die App braucht eine **HTTPS-Adresse**, damit das iPhone sie installieren und offline speichern kann.

### Variante A: GitHub Pages (automatisch)

1. Diesen Stand in den Branch `main` mergen.
2. Auf GitHub: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
3. Der Workflow `.github/workflows/pages.yml` veröffentlicht die App dann bei jedem Push auf `main`
   unter `https://<benutzername>.github.io/<repo-name>/`.

> Bei einem kostenlosen GitHub-Konto funktioniert Pages nur für **öffentliche** Repositories.

### Variante B: Netlify Drop (ohne Git)

Den Projektordner auf <https://app.netlify.com/drop> ziehen. Du bekommst sofort eine HTTPS-Adresse.

## Auf dem iPhone installieren

1. Die Adresse in **Safari** öffnen
2. Auf **Teilen** tippen (Quadrat mit Pfeil nach oben)
3. **„Zum Home-Bildschirm“** → **Hinzufügen**

Die App startet danach im Vollbild mit eigenem Icon und funktioniert auch ohne Internet.

## Lokal testen

```bash
npx http-server -p 8080
# dann http://localhost:8080 öffnen
```

## Updates

Nach Änderungen die Versionsnummer `CACHE` in `sw.js` erhöhen (z. B. `wizard-v2`).
Die App lädt neue Dateien, sobald sie online ist.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html` | Grundgerüst und iOS-Meta-Tags |
| `styles.css` | Design |
| `app.js` | Logik: Spielverwaltung, Wertung, Ansichten |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `manifest.webmanifest` | App-Name, Icons, Vollbild |
| `icons/` | App-Icons (`icon.svg` ist die Vorlage) |
