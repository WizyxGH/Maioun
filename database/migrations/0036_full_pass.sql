-- ---------------------------------------------------------------------------
-- Quand une source a-t-elle relu son inventaire EN ENTIER pour la dernière fois ?
--
-- LES SOURCES À ARRÊT ANTICIPÉ NE VOIENT JAMAIS TOUT. LocService trie par
-- fraîcheur et s'arrête dès qu'une page est entièrement connue : un passage
-- ordinaire lit deux ou trois pages sur vingt, et rend ~140 annonces pour un
-- millier connues. Le garde-fou « chute suspecte » saute alors le cycle de vie
-- — à juste titre, mais À CHAQUE FOIS : les annonces disparues n'étaient
-- retirées que lors d'un rattrapage lancé à la main. Relevé le 2026-09-10 :
-- 109 annonces LocService « actives » non revues depuis un à trois jours.
--
-- Avec cette date, la source sait quand un passage complet est dû, et le fait
-- de lui-même.
-- ---------------------------------------------------------------------------

ALTER TABLE source_state ADD COLUMN last_full_pass_at TEXT;
