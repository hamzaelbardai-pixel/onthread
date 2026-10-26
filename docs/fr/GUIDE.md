# OnThread — guide en français

**Right task. Right conversation. Every time.** La bonne tâche, dans la bonne conversation, à chaque fois.

OnThread est un plugin pour Claude Code. Il remarque quand une demande semble appartenir à une autre de tes conversations, et te pose la question avant de travailler dessus.

```text
Toi, dans la conversation « Marketing e-commerce » :
  Corrige le problème de synchronisation des paiements Stripe.

Claude :
  Cette demande ressemble plutôt à ta conversation « Intégration Stripe ».
  On continue ici quand même ?
```

## À quoi ça sert

Tu as plusieurs conversations Claude Code, souvent dans le même dossier : une pour le backend, une pour le design, une pour le marketing, une pour Stripe. Quand tu tapes une demande dans la mauvaise conversation, Claude ne le sait pas et commence à travailler au mauvais endroit, sans l'historique utile.

OnThread donne un sujet à chaque conversation et vérifie chaque nouvelle demande :

- **Une demande normale passe sans rien dire.** Pareil pour un sous-sujet, une évolution naturelle ou une petite question générale.
- **Une demande nettement hors sujet** déclenche une seule question courte avant de commencer, avec le nom de la bonne conversation.
- **Tu décides.** Si tu réponds « oui, ici », Claude fait la tâche et ne te repose plus la question sur ce sujet dans cette conversation (les 10 derniers sujets acceptés sont retenus).

## Installation

Il faut Claude Code et [Node.js](https://nodejs.org) 18 ou plus. Vérifie avec `node --version`.

Dans un terminal :

```bash
claude plugin marketplace add hamzaelbardai-pixel/onthread
claude plugin install onthread@onthread
```

Ou dans une session Claude Code :

```text
/plugin marketplace add hamzaelbardai-pixel/onthread
/plugin install onthread@onthread
```

Ouvre ensuite une **nouvelle** conversation, ou tape `/reload-plugins`. L'application de bureau utilise la même configuration que le terminal.

## Utilisation

Travaille normalement, il n'y a rien à configurer.

1. À ta première vraie demande, Claude répond et ajoute une ligne comme `🧭 OnThread · sujet : Paiements Stripe`. C'est le sujet enregistré pour cette conversation.
2. Ensuite, OnThread ne se manifeste que si une tâche relève clairement d'ailleurs.
3. Quand il te pose la question, réponds simplement : « oui, continue ici », ou va dans l'autre conversation. Il ne peut pas l'ouvrir à ta place.

## Les commandes

| Commande | Effet |
|---|---|
| `/onthread:topic` | Affiche le sujet de la conversation. `/onthread:topic Paiements Stripe` le change. |
| `/onthread:list` | Liste tes conversations avec leur sujet et leur dernière activité. |
| `/onthread:off` | Coupe OnThread pour cette conversation. `/onthread:off all` le coupe partout. |
| `/onthread:on` | Le rallume. `/onthread:on all` le rallume partout. |

## Confidentialité

Tout reste sur ton ordinateur, dans le dossier de données du plugin (`~/.claude/plugins/data/onthread-onthread/`).

- **Ce qui est enregistré :** l'identifiant de chaque conversation, son titre si tu l'as nommée toi-même, le dossier du projet, le sujet en une ligne, les sujets acceptés avec « continue ici », et les dates.
- **Ce qui n'est jamais enregistré :** tes messages, les réponses de Claude et le contenu de tes fichiers. Si un titre ou un sujet contient un mot de passe ou une clé reconnaissable (`mdp=…`, clé API, long jeton), il est remplacé par `[redacted]` avant d'être enregistré. Évite quand même de mettre un secret dans le nom d'une conversation.

- **Ce qui tourne :** quatre hooks de Claude Code (ouverture de session, chaque message, chaque commande `/onthread:*`, fin de chaque réponse) lancent `node scripts/onthread.mjs` depuis le dossier du plugin. Il ne lit et n'écrit que dans le dossier de données d'OnThread, ajoute une courte note (1 800 caractères au plus) au contexte de Claude avant chaque message, et ne fait aucun appel réseau.

Il n'y a ni serveur, ni télémétrie, ni clé API, ni service payant. La désinstallation supprime ces données ; ajoute `--keep-data` pour les garder.

## Limites à connaître

- **C'est une vérification, pas un verrou.** C'est Claude qui juge, à partir des informations fournies par OnThread. Ça fonctionne bien dans nos essais ([EVAL-RESULTS.md](../EVAL-RESULTS.md)), sans être une garantie absolue.
- **Il ne peut ni ouvrir ni créer une conversation à ta place.** Aucune interface de Claude Code ne le permet. Il te dit laquelle ouvrir.
- **Les titres.** Seuls les titres que tu donnes toi-même sont visibles par les plugins : `/rename`, ou renommer la conversation dans l'application. Sans titre, la conversation est désignée par son sujet.
- **Seules les conversations utilisées depuis l'installation sont connues.** Ton historique passé n'est jamais lu.

Détails : [LIMITATIONS.md](../LIMITATIONS.md) (en anglais).

## Désinstaller

```bash
claude plugin uninstall onthread@onthread
```

Pour simplement le mettre en pause : `/onthread:off all`.
