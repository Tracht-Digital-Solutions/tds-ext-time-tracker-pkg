<?php
declare(strict_types=1);

namespace Tds\Ext\TimeTracker;

use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Tds\Ext\TimeTracker\Domain\TimeEntryRepository;
use Tds\Frontend\Contract\AbstractModule;
use Tds\Frontend\Contract\ApiDocSource;
use Tds\Frontend\Contract\PermissionDef;
use Tds\Frontend\Contract\UserContext;

/**
 * Backend half of the time-tracker extension. Real time tracking scoped to the
 * authenticated panel user (`app_user_id` = the JWT `userId`): a single running
 * timer (start/stop), manual entries, a recent list, and the widget's weekly
 * total. Auth via the core `UserContext` (`time:read`/`time:write`); data via the
 * core PDO. Migration class names are `TimeTracker*`-prefixed (in-process
 * auto-migrator loads every module's migrations into one process).
 */
final class TimeTrackerModule extends AbstractModule implements ApiDocSource
{
    public function id(): string
    {
        return 'time-tracker';
    }

    public function register(App $app): void
    {
        $c = $app->getContainer();
        if ($c !== null && !$c->has(TimeEntryRepository::class)) {
            $c->set(TimeEntryRepository::class, static fn ($c) => new TimeEntryRepository($c->get(PDO::class)));
        }

        // Widget dataEndpoint: this week's total + running state.
        $app->get('/time/summary', function (Request $req, Response $res) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'time:read', $res)) !== null) {
                return $deny;
            }
            $repo = $c->get(TimeEntryRepository::class);
            $uid = (int) $user->userId();
            return self::json($res, [
                'weekHours' => round($repo->weekMinutes($uid) / 60, 2),
                'running' => $repo->running($uid),
            ]);
        });

        $app->get('/time/entries', function (Request $req, Response $res) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'time:read', $res)) !== null) {
                return $deny;
            }
            return self::json($res, ['entries' => $c->get(TimeEntryRepository::class)->recent((int) $user->userId())]);
        });

        $app->post('/time/start', function (Request $req, Response $res) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'time:write', $res)) !== null) {
                return $deny;
            }
            $note = self::optional(((array) $req->getParsedBody())['note'] ?? null, 500);
            $id = $c->get(TimeEntryRepository::class)->startTimer((int) $user->userId(), $note);
            return self::json($res, ['id' => $id], 201);
        });

        $app->post('/time/stop', function (Request $req, Response $res) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'time:write', $res)) !== null) {
                return $deny;
            }
            $stopped = $c->get(TimeEntryRepository::class)->stopTimer((int) $user->userId());
            return self::json($res, ['ok' => $stopped], $stopped ? 200 : 404);
        });

        $app->post('/time/entries', function (Request $req, Response $res) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'time:write', $res)) !== null) {
                return $deny;
            }
            $body = (array) $req->getParsedBody();
            $started = self::parseDateTime($body['started_at'] ?? null);
            $ended = self::parseDateTime($body['ended_at'] ?? null);
            if ($started === null || $ended === null || $ended <= $started) {
                return self::json($res, ['error' => 'valid started_at and a later ended_at are required'], 422);
            }
            $note = self::optional($body['note'] ?? null, 500);
            $id = $c->get(TimeEntryRepository::class)->createManual(
                (int) $user->userId(),
                $started->format('Y-m-d H:i:s'),
                $ended->format('Y-m-d H:i:s'),
                $note,
            );
            return self::json($res, ['id' => $id], 201);
        });

        $app->delete('/time/entries/{id:[0-9]+}', function (Request $req, Response $res, array $args) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'time:write', $res)) !== null) {
                return $deny;
            }
            $c->get(TimeEntryRepository::class)->delete((int) $user->userId(), (int) $args['id']);
            return self::json($res, ['ok' => true]);
        });
    }

    /** @return string[] */
    public function migrations(): array
    {
        return [__DIR__ . '/../db/migrations'];
    }

    /** @return PermissionDef[] */
    public function permissions(): array
    {
        return [
            new PermissionDef('time:read', 'Zeiten ansehen', 'time-tracker'),
            new PermissionDef('time:write', 'Zeiten erfassen', 'time-tracker'),
        ];
    }

    /**
     * Route documentation for the admin frontend's API reference. Kept in its
     * own file so the prose does not sit in the middle of the wiring.
     *
     * @return list<array<string, mixed>>
     */
    public function apiDocs(): array
    {
        return require __DIR__ . '/../docs/api.php';
    }

    // --- helpers ---------------------------------------------------------------

    private static function require(UserContext $user, string $permission, Response $res): ?Response
    {
        if (!$user->isAuthenticated() || $user->userId() === null) {
            return self::json($res, ['error' => 'Unauthorized'], 401);
        }
        if (!$user->has($permission)) {
            return self::json($res, ['error' => 'Forbidden'], 403);
        }
        return null;
    }

    private static function parseDateTime(mixed $value): ?\DateTimeImmutable
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }
        try {
            return new \DateTimeImmutable($value);
        } catch (\Throwable) {
            return null;
        }
    }

    private static function optional(mixed $value, int $limit): ?string
    {
        $v = trim((string) ($value ?? ''));
        return $v === '' ? null : mb_substr($v, 0, $limit);
    }

    private static function json(Response $res, mixed $data, int $status = 200): Response
    {
        $res->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR));
        return $res->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}
