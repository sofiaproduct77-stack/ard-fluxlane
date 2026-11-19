# FluxLane — UML (2 диаграммы)

## 1. Диаграмма классов

Доменные модели (Sequelize), связи и REST-контроллеры платформы.

```mermaid
classDiagram
    direction TB

    class User {
        +Integer id
        +String username
        +String email
        +Enum role
        +checkPassword() Boolean
        +toPublicJSON() Object
    }

    class News {
        +Integer id
        +String title
        +Text content
        +Integer authorId
    }

    class Document {
        +Integer id
        +String title
        +Integer uploadedBy
    }

    class Accident {
        +Integer id
        +Date date
        +Integer accidentsCount
        +Integer deathsCount
        +Integer injuredCount
        +String district
        +String street
    }

    class Fine {
        +Integer id
        +Date date
        +Integer violationsCount
        +Decimal imposedAmount
    }

    class Evacuation {
        +Integer id
        +Date date
        +Integer count
    }

    class Detector {
        +Integer id
        +String name
        +Float latitude
        +Float longitude
    }

    class Edge {
        +Integer id
        +Integer fromDetectorId
        +Integer toDetectorId
        +JSON geometry
    }

    class VehiclePassage {
        +Integer id
        +Integer detectorId
        +String vehicleId
        +Date timestamp
        +Float speed
    }

    class VehicleTrack {
        +Integer id
        +String vehicleId
        +Date startTime
        +Date endTime
        +JSON detectorSequence
        +Float avgSpeed
    }

    class RouteCluster {
        +Integer id
        +Date windowStart
        +Date windowEnd
        +JSON detectorSequence
        +Integer vehiclesCount
    }

    class TrafficRouter {
        <<controller>>
        +GET /detectors
        +GET /edge-stats
        +GET /route
        +GET /shortest-path
    }

    class AccidentsRouter {
        <<controller>>
        +GET /statistics
        +GET /map-events
    }

    class AuthRouter {
        <<controller>>
        +POST /login
        +GET /me
    }

    User "1" --> "0..*" News : author
    User "1" --> "0..*" Document : uploader

    Detector "1" --> "0..*" Edge : from / to
    Detector "1" --> "0..*" VehiclePassage

    VehiclePassage ..> VehicleTrack : build-tracks
    Edge ..> VehicleTrack : статистика рёбер

    TrafficRouter ..> Detector
    TrafficRouter ..> Edge
    TrafficRouter ..> VehicleTrack
    AccidentsRouter ..> Accident
    AuthRouter ..> User
```

---

## 2. Диаграмма состояний

Жизненный цикл страницы **«Карта и маршруты»** (`traffic-analysis.js`): потоки по датчикам и маршрут A→B.

```mermaid
stateDiagram-v2
    [*] --> ЗагрузкаКарты

    ЗагрузкаКарты --> ОжиданиеДействия : датчики и интервал времени готовы

    state ОжиданиеДействия {
        [*] --> Простой
        Простой --> ЗагрузкаПотоков : «Показать» / автозагрузка
        ЗагрузкаПотоков --> ПотокиОтображены : edge-stats OK
        ЗагрузкаПотоков --> НетПотоков : нет данных за период
        НетПотоков --> Простой : сменить интервал
        ПотокиОтображены --> Простой : «Сброс»
    }

    ОжиданиеДействия --> ВыборТочек : «Точки на карте»

    state ВыборМаршрута {
        ВыборТочек --> ТочкаA : клик A
        ТочкаA --> ТочкиВыбраны : клик B
        ТочкиВыбраны --> ПоискМаршрута : «Найти маршрут»
        ПоискМаршрута --> МаршрутПоказан : OSRM или graph OK
        ПоискМаршрута --> ОшибкаМаршрута : not found
        ОшибкаМаршрута --> ТочкиВыбраны
        МаршрутПоказан --> ТочкиВыбраны : новый поиск
        МаршрутПоказан --> Простой : «Очистить маршрут»
        ВыборТочек --> Простой : «Сброс точек»
    }

    ВыборМаршрута --> ОжиданиеДействия : выход из режима маршрута
```

---

*Файл проекта: `docs/UML-diagrams.md`*
