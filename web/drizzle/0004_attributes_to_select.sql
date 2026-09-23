-- Every attribute becomes a growable choice list ("select"): values typed in
-- the registration form are added as new options instead of being rejected.
-- Seed each attribute's options with its existing options (order kept) plus
-- any values already used by plays but missing from them, so former free-text
-- attributes keep their values selectable.
UPDATE "attribute_defs" AS d
SET
  "type" = 'select',
  "options" = (
    SELECT COALESCE(jsonb_agg(u.value ORDER BY u.ord, u.value), '[]'::jsonb)
    FROM (
      SELECT s.value, MIN(s.ord) AS ord
      FROM (
        SELECT o.value #>> '{}' AS value, o.ord
        FROM jsonb_array_elements(COALESCE(d."options", '[]'::jsonb)) WITH ORDINALITY AS o(value, ord)
        UNION ALL
        SELECT v."value", 2147483647 AS ord
        FROM "play_attribute_values" AS v
        WHERE v."attribute_def_id" = d."id"
      ) AS s
      GROUP BY s.value
    ) AS u
  );
