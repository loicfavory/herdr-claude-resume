# herdr-claude-resume

Mod pour [Herdr](https://herdr.dev) (application de bureau) qui relance automatiquement les sessions
[Claude Code](https://claude.com/claude-code) qui tournaient dans les terminaux Herdr quand l'application
ou l'ordinateur s'est arrêté (redémarrage, extinction, plantage).

Herdr restaure les espaces, onglets et panneaux, mais pas encore les agents
([herdr-core#13](https://github.com/herdrdev/herdr-core/issues/13)). Ce mod comble ce manque en attendant.

## Fonctionnement

- Toutes les 30 secondes, le mod note quelle session Claude tourne dans quel terminal : le pid du programme au
  premier plan (`hc get`) donne l'identifiant de session via `~/.claude/sessions/<pid>.json`.
  La photo est écrite dans `~/.config/herdr-app/data/claude-resume/snapshot.json`.
- Au démarrage de Herdr, chaque terminal noté qui est revenu à une invite de shell reçoit
  `cd <dossier> && claude --resume <id>`. Une session déjà ouverte dans un autre terminal n'est pas relancée,
  et chaque session n'est relancée qu'une fois. Une notification indique le nombre de sessions reprises.
- Une session quittée normalement (`/exit`) disparaît de la photo suivante : elle n'est pas relancée.
- Aucun hook Claude Code ni script système n'est nécessaire.

## Installation

1. Copier le dossier du mod :

   ```sh
   git clone https://github.com/loicfavory/herdr-claude-resume ~/.config/herdr-app/mods/claude-resume
   ```

   (Le nom du dossier doit être `claude-resume`.)

2. Ajouter le mod au layout. Les layouts livrés avec Herdr (`main`, `terminals`, `win98`) sont réinstallés
   à chaque démarrage : il faut d'abord en faire une copie, qui devient le layout actif.

   ```sh
   herdr-app do layout.clone '{"name":"main","as":"mon-layout"}'
   ```

   Dans `~/.config/herdr-app/layouts/mon-layout.json`, ajouter ce bloc invisible aux enfants d'un nœud
   toujours affiché (par exemple le nœud `work` du layout `main`) :

   ```json
   { "id": "claude-resume", "type": "block", "size": { "px": 0 }, "content": { "mod": "claude-resume" } }
   ```

3. Vérifier : `herdr-app check ~/.config/herdr-app/mods/claude-resume` puis `herdr-app status` (aucune
   erreur attendue). Après 30 secondes, `snapshot.json` liste les terminaux où tourne Claude.

## Compatibilité

- Testé sur Linux (Arch, Herdr 0.1.15, herdr-core 0.1.21), avec zsh.
- macOS : devrait fonctionner tel quel (mêmes chemins, shells POSIX), non testé.
- Windows : prévu (PowerShell, `cmd`, noms en `.exe`), non testé. Le chemin des sessions Claude Code y est
  `%USERPROFILE%\.claude\sessions`.

## Limites

- La relance n'a lieu qu'au démarrage de Herdr, pour les terminaux restaurés par herdr-core avec le même
  identifiant (comportement par défaut).
- Une session lancée hors d'un terminal Herdr n'est pas détectée comme « déjà ouverte ».
- Un dossier de travail sur lequel Claude Code n'a pas encore été autorisé affiche la question de confiance
  habituelle.
- Par sécurité, une session dont le dossier contient des guillemets, `$`, `` ` ``, `%`, `!`, `;`, `&`, `|`, `<`,
  `>` (ou `\` hors Windows) n'est pas relancée : le chemin est inséré dans une commande shell.

## Licence

MIT
