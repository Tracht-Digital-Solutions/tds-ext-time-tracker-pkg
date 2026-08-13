<?php
/**
 * API documentation for this module's routes — consumed through `ApiDocSource`
 * and rendered in the admin frontend's API reference (`GET /wiki.json`).
 *
 * `pattern` must match the Slim pattern in `register()` VERBATIM, inline regex
 * included (`/time/entries/{id:[0-9]+}`): it is the join key for the route
 * introspection. `php/tests/TimeTrackerApiDocsTest.php` fails the build if the
 * documented set and the registered set drift apart in either direction.
 */

declare(strict_types=1);

return [
    [
        'method' => 'GET',
        'pattern' => '/time/summary',
        'summary' => 'Wochensumme und laufender Timer',
        'description' => 'Die `dataEndpoint`-Route des Dashboard-Widgets. Immer auf den '
            . 'angemeldeten Nutzer bezogen (`app_user_id` = `userId` aus dem JWT) — es '
            . 'gibt keine Möglichkeit, fremde Zeiten zu lesen.',
        'permission' => 'time:read',
        'responses' => [
            [
                'status' => 200,
                'description' => 'Stunden dieser Woche (auf zwei Nachkommastellen) und der laufende Eintrag, falls vorhanden.',
                'example' => '{"weekHours":12.75,"running":{"id":42,"started_at":"2026-08-13 09:00:00","note":null}}',
            ],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `time:read`.'],
        ],
    ],
    [
        'method' => 'GET',
        'pattern' => '/time/entries',
        'summary' => 'Letzte Zeiteinträge des angemeldeten Nutzers',
        'permission' => 'time:read',
        'responses' => [
            ['status' => 200, 'description' => '`{entries: [{id, started_at, ended_at, minutes, note}]}`, neueste zuerst.'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `time:read`.'],
        ],
    ],
    [
        'method' => 'POST',
        'pattern' => '/time/start',
        'summary' => 'Timer starten',
        'description' => 'Es gibt genau einen laufenden Timer pro Nutzer.',
        'permission' => 'time:write',
        'params' => [
            [
                'in' => 'body',
                'name' => 'note',
                'type' => 'string',
                'description' => 'Optionale Notiz, auf 500 Zeichen gekürzt. Leer wird als NULL gespeichert.',
            ],
        ],
        'responses' => [
            ['status' => 201, 'description' => '`{id}` des angelegten Eintrags.'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `time:write`.'],
        ],
    ],
    [
        'method' => 'POST',
        'pattern' => '/time/stop',
        'summary' => 'Laufenden Timer beenden',
        'permission' => 'time:write',
        'responses' => [
            ['status' => 200, 'description' => '`{ok: true}` — der Timer lief und wurde beendet.'],
            ['status' => 404, 'description' => '`{ok: false}` — es lief kein Timer.'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `time:write`.'],
        ],
    ],
    [
        'method' => 'POST',
        'pattern' => '/time/entries',
        'summary' => 'Zeiteintrag manuell anlegen',
        'description' => 'Für nachgetragene Zeiten. Beide Zeitpunkte werden über '
            . '`DateTimeImmutable` geparst, akzeptieren also jedes von PHP verstandene '
            . 'Format; `ended_at` muss echt nach `started_at` liegen.',
        'permission' => 'time:write',
        'params' => [
            ['in' => 'body', 'name' => 'started_at', 'type' => 'datetime', 'required' => true, 'description' => 'Beginn.'],
            ['in' => 'body', 'name' => 'ended_at', 'type' => 'datetime', 'required' => true, 'description' => 'Ende, muss nach `started_at` liegen.'],
            ['in' => 'body', 'name' => 'note', 'type' => 'string', 'description' => 'Optionale Notiz, auf 500 Zeichen gekürzt.'],
        ],
        'responses' => [
            ['status' => 201, 'description' => '`{id}` des angelegten Eintrags.'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `time:write`.'],
            ['status' => 422, 'description' => 'Zeitpunkt fehlt, ist unlesbar, oder `ended_at` liegt nicht nach `started_at`.'],
        ],
    ],
    [
        'method' => 'DELETE',
        'pattern' => '/time/entries/{id:[0-9]+}',
        'summary' => 'Zeiteintrag löschen',
        'description' => 'Löscht nur innerhalb der eigenen Einträge — eine fremde Id trifft '
            . 'keine Zeile und meldet trotzdem Erfolg, statt die Existenz preiszugeben.',
        'permission' => 'time:write',
        'params' => [
            ['in' => 'path', 'name' => 'id', 'type' => 'int', 'required' => true, 'description' => 'Id des Eintrags.'],
        ],
        'responses' => [
            ['status' => 200, 'description' => '`{ok: true}`'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `time:write`.'],
        ],
    ],
];
