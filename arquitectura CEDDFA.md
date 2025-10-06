CEDDFA con DTOs (Data Transfer Objects)
Vamos a mejorar la arquitectura CEDDFA incorporando DTOs para un mejor control del manejo y empaquetado de datos. Los DTOs serán cruciales para la comunicación cliente-servidor.

Implementación Completa con DTOs
csharp
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

// 1. DTOs para la comunicación cliente-servidor
public abstract class BaseDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    [JsonPropertyName("type")]
    public string Type { get; set; }
    
    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    
    [JsonPropertyName("version")]
    public string Version { get; set; } = "1.0";
}

// DTO para mensajes del sistema
public class SystemMessageDto : BaseDto
{
    [JsonPropertyName("action")]
    public string Action { get; set; } // CREATE, UPDATE, DELETE, NOTIFY
    
    [JsonPropertyName("entity")]
    public string Entity { get; set; } // USER, PRODUCT, ORDER, etc.
    
    [JsonPropertyName("payload")]
    public JsonElement Payload { get; set; }
    
    [JsonPropertyName("targetComponents")]
    public List<string> TargetComponents { get; set; } = new List<string>();
}

// DTO para datos de usuario
public class UserDto : BaseDto
{
    [JsonPropertyName("userId")]
    public string UserId { get; set; }
    
    [JsonPropertyName("userName")]
    public string UserName { get; set; }
    
    [JsonPropertyName("email")]
    public string Email { get; set; }
    
    [JsonPropertyName("profile")]
    public UserProfileDto Profile { get; set; }
}

public class UserProfileDto
{
    [JsonPropertyName("firstName")]
    public string FirstName { get; set; }
    
    [JsonPropertyName("lastName")]
    public string LastName { get; set; }
    
    [JsonPropertyName("preferences")]
    public Dictionary<string, object> Preferences { get; set; } = new Dictionary<string, object>();
}

// DTO para productos
public class ProductDto : BaseDto
{
    [JsonPropertyName("productId")]
    public string ProductId { get; set; }
    
    [JsonPropertyName("name")]
    public string Name { get; set; }
    
    [JsonPropertyName("price")]
    public decimal Price { get; set; }
    
    [JsonPropertyName("category")]
    public string Category { get; set; }
    
    [JsonPropertyName("inStock")]
    public bool InStock { get; set; }
}

// 2. EventArgs con soporte para DTOs
public class ComponentEventArgs : EventArgs
{
    public BaseDto Dto { get; }
    public string EventType { get; }
    public string Origin { get; }

    public ComponentEventArgs(BaseDto dto, string eventType, string origin = null)
    {
        Dto = dto;
        EventType = eventType;
        Origin = origin;
    }
}

// 3. Interfaces para el Event Bus
public interface IEventPublisher
{
    void Publish(ComponentEventArgs eventArgs);
    event EventHandler<ComponentEventArgs> OnEventPublished;
}

public interface IEventSubscriber
{
    void Subscribe(string eventType, Action<ComponentEventArgs> handler);
    void Unsubscribe(string eventType, Action<ComponentEventArgs> handler);
}

// 4. Implementación del Event Bus
public class EventBus : IEventPublisher, IEventSubscriber
{
    private readonly Dictionary<string, List<Action<ComponentEventArgs>>> _subscriptions = new();
    
    public event EventHandler<ComponentEventArgs> OnEventPublished;

    public void Publish(ComponentEventArgs eventArgs)
    {
        OnEventPublished?.Invoke(this, eventArgs);
        
        if (_subscriptions.TryGetValue(eventArgs.EventType, out var handlers))
        {
            foreach (var handler in handlers.ToList())
            {
                handler(eventArgs);
            }
        }
    }

    public void Subscribe(string eventType, Action<ComponentEventArgs> handler)
    {
        if (!_subscriptions.ContainsKey(eventType))
            _subscriptions[eventType] = new List<Action<ComponentEventArgs>>();
        
        if (!_subscriptions[eventType].Contains(handler))
            _subscriptions[eventType].Add(handler);
    }

    public void Unsubscribe(string eventType, Action<ComponentEventArgs> handler)
    {
        if (_subscriptions.TryGetValue(eventType, out var handlers))
        {
            handlers.Remove(handler);
        }
    }
}

// 5. Clase base para componentes con soporte DTO
public abstract class ComponentBase<T> : INotifyPropertyChanged, IDisposable where T : BaseDto
{
    private T _dataSource;
    protected readonly IEventSubscriber EventSubscriber;
    private readonly string _componentId;
    private bool _disposed = false;

    public T DataSource
    {
        get => _dataSource;
        set
        {
            if (!Equals(_dataSource, value))
            {
                _dataSource = value;
                OnPropertyChanged();
            }
        }
    }

    public string ComponentId => _componentId;
    public abstract string[] SupportedEventTypes { get; }

    public event PropertyChangedEventHandler PropertyChanged;

    protected ComponentBase(IEventSubscriber eventSubscriber, string componentId = null)
    {
        EventSubscriber = eventSubscriber;
        _componentId = componentId ?? Guid.NewGuid().ToString();
        
        // Suscribirse automáticamente a los eventos soportados
        foreach (var eventType in SupportedEventTypes)
        {
            EventSubscriber.Subscribe(eventType, HandleEvent);
        }
    }

    protected virtual void OnPropertyChanged([System.Runtime.CompilerServices.CallerMemberName] string propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    public abstract void Render();
    protected abstract void HandleEvent(ComponentEventArgs args);

    protected virtual void Dispose(bool disposing)
    {
        if (!_disposed)
        {
            if (disposing)
            {
                // Limpiar suscripciones
                foreach (var eventType in SupportedEventTypes)
                {
                    EventSubscriber.Unsubscribe(eventType, HandleEvent);
                }
            }
            _disposed = true;
        }
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }
}

// 6. Servicio de serialización/deserialización DTO
public interface IDtoSerializer
{
    string Serialize<T>(T dto) where T : BaseDto;
    T Deserialize<T>(string json) where T : BaseDto;
    BaseDto Deserialize(string json, string type);
}

public class JsonDtoSerializer : IDtoSerializer
{
    private readonly JsonSerializerOptions _options;

    public JsonDtoSerializer()
    {
        _options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true,
            Converters = { new JsonStringEnumConverter() }
        };
    }

    public string Serialize<T>(T dto) where T : BaseDto
    {
        return JsonSerializer.Serialize(dto, _options);
    }

    public T Deserialize<T>(string json) where T : BaseDto
    {
        return JsonSerializer.Deserialize<T>(json, _options);
    }

    public BaseDto Deserialize(string json, string type)
    {
        return type switch
        {
            nameof(SystemMessageDto) => JsonSerializer.Deserialize<SystemMessageDto>(json, _options),
            nameof(UserDto) => JsonSerializer.Deserialize<UserDto>(json, _options),
            nameof(ProductDto) => JsonSerializer.Deserialize<ProductDto>(json, _options),
            _ => throw new NotSupportedException($"Tipo DTO no soportado: {type}")
        };
    }
}

// 7. Almacenamiento local mejorado con DTOs
public interface ILocalStorageService
{
    void StoreDto<T>(T dto) where T : BaseDto;
    T GetDto<T>(string id) where T : BaseDto;
    List<T> GetDtosByType<T>() where T : BaseDto;
    void RemoveDto(string id);
}

public class MemoryStorageService : ILocalStorageService
{
    private readonly Dictionary<string, BaseDto> _storage = new();
    private readonly IDtoSerializer _serializer;

    public MemoryStorageService(IDtoSerializer serializer)
    {
        _serializer = serializer;
    }

    public void StoreDto<T>(T dto) where T : BaseDto
    {
        _storage[dto.Id] = dto;
        Console.WriteLine($"DTO almacenado: {dto.Type} - {dto.Id}");
    }

    public T GetDto<T>(string id) where T : BaseDto
    {
        return _storage.TryGetValue(id, out var dto) ? (T)dto : null;
    }

    public List<T> GetDtosByType<T>() where T : BaseDto
    {
        var typeName = typeof(T).Name;
        return _storage.Values
            .Where(d => d.GetType().Name == typeName)
            .Cast<T>()
            .ToList();
    }

    public void RemoveDto(string id)
    {
        _storage.Remove(id);
    }
}

// 8. Procesador de mensajes mejorado con DTOs
public class MessageProcessor : IDisposable
{
    private readonly IEventPublisher _eventPublisher;
    private readonly ILocalStorageService _storage;
    private readonly IDtoSerializer _serializer;
    private readonly CancellationTokenSource _cts = new();
    private bool _disposed = false;

    public MessageProcessor(IEventPublisher eventPublisher, ILocalStorageService storage, IDtoSerializer serializer)
    {
        _eventPublisher = eventPublisher;
        _storage = storage;
        _serializer = serializer;
    }

    public async Task StartProcessingAsync()
    {
        while (!_cts.Token.IsCancellationRequested)
        {
            await SimulateIncomingMessages();
            await Task.Delay(2000, _cts.Token);
        }
    }

    private async Task SimulateIncomingMessages()
    {
        // Simular diferentes tipos de mensajes del servidor
        var messageTypes = new[] { "USER_UPDATE", "PRODUCT_UPDATE", "SYSTEM_NOTIFICATION" };
        var random = new Random();
        var messageType = messageTypes[random.Next(messageTypes.Length)];

        BaseDto dto = messageType switch
        {
            "USER_UPDATE" => new UserDto
            {
                Type = "USER_UPDATE",
                UserId = $"USER_{random.Next(1000)}",
                UserName = $"user{random.Next(1000)}",
                Email = $"user{random.Next(1000)}@example.com",
                Profile = new UserProfileDto
                {
                    FirstName = "John",
                    LastName = "Doe",
                    Preferences = new Dictionary<string, object>
                    {
                        ["theme"] = "dark",
                        ["language"] = "es"
                    }
                }
            },
            "PRODUCT_UPDATE" => new ProductDto
            {
                Type = "PRODUCT_UPDATE",
                ProductId = $"PROD_{random.Next(1000)}",
                Name = $"Product {random.Next(1000)}",
                Price = random.Next(10, 1000),
                Category = random.Next(0, 2) == 0 ? "Electronics" : "Books",
                InStock = random.Next(0, 2) == 0
            },
            "SYSTEM_NOTIFICATION" => new SystemMessageDto
            {
                Type = "SYSTEM_NOTIFICATION",
                Action = "NOTIFY",
                Entity = "SYSTEM",
                TargetComponents = new List<string> { "UserComponent", "ProductComponent" },
                Payload = JsonDocument.Parse("{\"message\": \"System update available\", \"priority\": \"LOW\"}").RootElement
            },
            _ => null
        };

        if (dto != null)
        {
            await ProcessIncomingDto(dto);
        }
    }

    public async Task ProcessIncomingDto(BaseDto dto)
    {
        try
        {
            Console.WriteLine($"Procesando DTO recibido: {dto.Type} - {dto.Id}");

            // 1. Almacenar DTO
            _storage.StoreDto(dto);

            // 2. Publicar evento
            var eventArgs = new ComponentEventArgs(dto, dto.Type, "server");
            _eventPublisher.Publish(eventArgs);

            Console.WriteLine($"DTO procesado y evento publicado: {dto.Type}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error procesando DTO: {ex.Message}");
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _cts.Cancel();
            _cts.Dispose();
            _disposed = true;
        }
    }
}

// 9. Componentes concretos con soporte DTO
public class UserComponent : ComponentBase<UserDto>
{
    public override string[] SupportedEventTypes => new[] { "USER_UPDATE", "SYSTEM_NOTIFICATION" };

    public UserComponent(IEventSubscriber eventSubscriber) : base(eventSubscriber, "UserComponent")
    {
        Console.WriteLine("Componente de Usuario inicializado");
    }

    protected override void HandleEvent(ComponentEventArgs args)
    {
        if (args.Dto is UserDto userDto)
        {
            DataSource = userDto;
            Console.WriteLine($"Componente Usuario: Datos actualizados - {userDto.UserName}");
        }
        else if (args.Dto is SystemMessageDto systemMessage)
        {
            Console.WriteLine($"Componente Usuario: Notificación del sistema - {systemMessage.Action}");
        }
    }

    public override void Render()
    {
        if (DataSource != null)
        {
            Console.WriteLine($"=== RENDERIZANDO COMPONENTE USUARIO ===");
            Console.WriteLine($"ID: {DataSource.UserId}");
            Console.WriteLine($"Nombre: {DataSource.UserName}");
            Console.WriteLine($"Email: {DataSource.Email}");
            Console.WriteLine($"======================================");
        }
    }
}

public class ProductComponent : ComponentBase<ProductDto>
{
    public override string[] SupportedEventTypes => new[] { "PRODUCT_UPDATE", "SYSTEM_NOTIFICATION" };

    public ProductComponent(IEventSubscriber eventSubscriber) : base(eventSubscriber, "ProductComponent")
    {
        Console.WriteLine("Componente de Producto inicializado");
    }

    protected override void HandleEvent(ComponentEventArgs args)
    {
        if (args.Dto is ProductDto productDto)
        {
            DataSource = productDto;
            Console.WriteLine($"Componente Producto: Datos actualizados - {productDto.Name}");
        }
        else if (args.Dto is SystemMessageDto systemMessage)
        {
            Console.WriteLine($"Componente Producto: Notificación del sistema - {systemMessage.Action}");
        }
    }

    public override void Render()
    {
        if (DataSource != null)
        {
            Console.WriteLine($"=== RENDERIZANDO COMPONENTE PRODUCTO ===");
            Console.WriteLine($"ID: {DataSource.ProductId}");
            Console.WriteLine($"Nombre: {DataSource.Name}");
            Console.WriteLine($"Precio: {DataSource.Price:C}");
            Console.WriteLine($"Categoría: {DataSource.Category}");
            Console.WriteLine($"En stock: {DataSource.InStock}");
            Console.WriteLine($"========================================");
        }
    }
}

// 10. Cliente simulado que envía DTOs
public class SimulatedClient
{
    private readonly MessageProcessor _processor;
    private readonly IDtoSerializer _serializer;
    private readonly Random _random = new();

    public SimulatedClient(MessageProcessor processor, IDtoSerializer serializer)
    {
        _processor = processor;
        _serializer = serializer;
    }

    public async Task SendUserUpdate()
    {
        var userDto = new UserDto
        {
            Type = "USER_UPDATE",
            UserId = "USER_CLIENT_001",
            UserName = "client_user",
            Email = "client@example.com",
            Profile = new UserProfileDto
            {
                FirstName = "Client",
                LastName = "User",
                Preferences = new Dictionary<string, object>
                {
                    ["notifications"] = true,
                    ["autoSave"] = false
                }
            }
        };

        Console.WriteLine("Cliente enviando DTO de usuario...");
        await _processor.ProcessIncomingDto(userDto);
    }

    public async Task SendProductUpdate()
    {
        var productDto = new ProductDto
        {
            Type = "PRODUCT_UPDATE",
            ProductId = "PROD_CLIENT_001",
            Name = "Laptop Gaming",
            Price = 1299.99m,
            Category = "Electronics",
            InStock = true
        };

        Console.WriteLine("Cliente enviando DTO de producto...");
        await _processor.ProcessIncomingDto(productDto);
    }
}

// 11. Programa principal
class Program
{
    static async Task Main(string[] args)
    {
        Console.WriteLine("=== INICIANDO ARQUITECTURA CEDDFA CON DTOs ===\n");

        // Configuración de dependencias
        var serializer = new JsonDtoSerializer();
        var eventBus = new EventBus();
        var storage = new MemoryStorageService(serializer);
        var messageProcessor = new MessageProcessor(eventBus, storage, serializer);
        var client = new SimulatedClient(messageProcessor, serializer);

        // Crear componentes
        var userComponent = new UserComponent(eventBus);
        var productComponent = new ProductComponent(eventBus);

        // Configurar logging de eventos
        eventBus.OnEventPublished += (s, e) =>
        {
            Console.WriteLine($"\n[EVENT BUS] Evento publicado: {e.EventType} desde {e.Origin}");
        };

        // Iniciar procesamiento de mensajes
        var processingTask = messageProcessor.StartProcessingAsync();

        Console.WriteLine("Sistema iniciado. Simulando mensajes...\n");

        // Simular envío de mensajes desde el cliente
        await Task.Delay(3000);
        await client.SendUserUpdate();
        
        await Task.Delay(3000);
        await client.SendProductUpdate();

        // Esperar un poco más para ver mensajes automáticos
        await Task.Delay(6000);

        // Limpieza
        messageProcessor.Dispose();
        userComponent.Dispose();
        productComponent.Dispose();

        Console.WriteLine("\n=== ARQUITECTURA CEDDFA FINALIZADA ===");
    }
}
Flujo de Datos con DTOs
text
[Servidor] → [DTO Serializado] → [Transporte] → [Cliente] → [MessageProcessor]
     ↓               ↓               ↓              ↓              ↓
  Genera          JSON/Protobuf   WebSocket/     Recibe       Deserializa
   DTO                            HTTP/SSE      mensaje         DTO
                                                              ↓
[Almacenamiento] ← [Event Bus] ← [Publica Evento] ← [Procesa DTO]
     ↓                   ↓              ↓
  Guarda DTO        Notifica a     Componentes
                    componentes    específicos
                         ↓
                 [Actualiza UI] ← [Renderiza] ← [Handle Event]
Características Clave de los DTOs en CEDDFA
1. Serialización Estructurada
csharp
// Ejemplo de DTO serializado
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "type": "USER_UPDATE",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0",
  "userId": "USER_001",
  "userName": "johndoe",
  "email": "john@example.com"
}
2. Tipado Fuerte
Cada DTO tiene un propósito específico

Propiedades bien definidas con tipos concretos

Validación integrada en la serialización

3. Versionado
Los DTOs incluyen versión para compatibilidad

Fácil evolución de la API

4. Metadatos
Timestamp para seguimiento temporal

ID único para trazabilidad

Tipo específico para routing

Ventajas de esta Implementación
✅ Contrato claro entre cliente y servidor
✅ Serialización/deserialización automática
✅ Validación de datos en tiempo de compilación
✅ Evolución controlada con versionado
✅ Trazabilidad completa de mensajes
✅ Separación clara entre transporte y negocio

Esta arquitectura es ideal para aplicaciones que requieren:

Comunicación en tiempo real

Múltiples fuentes de datos

Actualizaciones en vivo de UI

Trazabilidad de mensajes

Escalabilidad horizontal