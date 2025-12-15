# Симулация на PV система
Тази симулация генерира данни от виртуална фотоволтаична (PV) система, които могат да се използват за тестване и визуализация в информационна система. Основната цел е да се осигурят реалистични времеви стойности за мощност и метеорологични данни, без да се налага наличието на реална PV система.

## Какво прави симулацията

1. **Генерира реалистична дневна крива на слънчевото греене (irradiance)**

2. **Симулира температурата на модула и околната среда**

3. **Изчислява мощността на инвертора (kW)**

4. **Симулира метеорологични данни**

5. **Създава "виртуално устройство"**

6. **Записва данните в MySQL**
   - `weather_data` – температура, irradiance, вятър
   - `telemetry` – параметър "Power" на инвертора

## Seed vs Live симулация

### Seed
Генерира данни за избрани моменти през деня: `00:00, 01:00, 02:00, ..., 23:00`.

### Live (реално време)
Генерира нови данни непрекъснато през определен интервал от време - `intervalMs` (по подразбиране е 15s):
`t = 0, t = t + 15s, t = 2t + 15s ... t = nt + 15s.`

- Seed данните са полезни за тестване на графики и отчети без необходимостта за стартиране на реална симулация.
- Live симулацията осигурява непрекъснат поток от данни.

## Начини за използване
1. **Създаване на тестов site**
```
INSERT INTO site (name, capacity_kw, timezone)
VALUES ('Test Site', 5.00, 'Europe/Sofia');
SELECT * FROM site;
```

2. **Пускане на сървъра**

Първо трябва да се премине в директорията `server`:
```
cd src/server
```

Пуснете сървъра:
```
npm run dev
```

3. **Пример за стартиране на реална (live) симулация**

***За Windows да се използва*** `curl.exe`

```
curl -X POST http://localhost:3000/sites/1/simulate/start
```

4. **Спиране на симулацията**
```
curl -X POST http://localhost:3000/sites/1/simulate/stop
```

5. **Генериране на seed данни**
```
curl -X POST http://localhost:3000/sites/1/simulate/seed
```

6. **Изтриване на всички генерирани данни**
```
curl -X DELETE http://localhost:3000/sites/1/simulate/clear
```

## Преглед на данните

### 1. В `MySQL`

#### Telemetry данни (мощност на инвертора):
```
SELECT * FROM telemetry ORDER BY timestamp DESC;
```

#### Weather data (метеорологични данни):
```
SELECT * FROM weather_data ORDER BY timestamp DESC;
```

### 2. С `curl`
```
curl http://localhost:3000/sites/1/telemetry
```

- `limit` – максимален брой извадки

## Полезни MySQL заявки:

### Брой записи:
```
SELECT COUNT(*) FROM telemetry;
```

### Крива на мощността (Power over time):
```
SELECT timestamp, value
FROM telemetry
WHERE parameter = 'Power'
ORDER BY timestamp;
```

### Дневна енергия (Daily energy estimate (kWh)):
```
SELECT 
  DATE(timestamp) AS day,
  SUM(value) * (5.0 / 3600) AS estimated_kwh
FROM telemetry
GROUP BY DATE(timestamp);
```
