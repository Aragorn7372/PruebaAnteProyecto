using Path = System.IO.Path;

namespace FunkoApi.config;


public class StorageSettings
{
    /// <summary>
    /// Ruta base donde se guardan los archivos
    /// </summary>
    public string RootPath { get; set; } = "wwwroot/uploads";
    
    /// <summary>
    /// Si es true, borra el contenido del directorio al iniciar
    /// </summary>
    public bool DeleteOnStartup { get; set; }
    
    /// <summary>
    /// Tamaño máximo permitido en bytes 10 megas por defecto cruck
    /// </summary>
    public long MaxFileSize { get; set; } = 10 * 1024 * 1024;
    
    /// <summary>
    /// Extensiones de archivo permitidas
    /// </summary>
    public string[] AllowedExtensions { get; set; } = 
        { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
    
    /// <summary>
    /// Tipos MIME permitidos para imágenes
    /// </summary>
    public string[] AllowedImageTypes { get; set; } = 
        { "image/jpeg", "image/png", "image/gif", "image/webp" };
    
    /// <summary>
    /// Nombre del subdirectorio para imágenes
    /// </summary>
    public string ImagesFolder { get; set; } = "images";
    
    /// <summary>
    /// Nombre del subdirectorio para documentos
    /// </summary>
    public string DocumentsFolder { get; set; } = "documents";
    
    /// <summary>
    /// Obtiene la ruta completa de una carpeta
    /// </summary>
    public string GetFolderPath(string folderName)
    {
        return Path.Combine(RootPath, folderName);
    }
}